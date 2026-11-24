# Dev Note: Testing podinfo's ALB SLIs on `dev` (2026-11-24)

What was run to test #166 (eks-forge-app-of-apps PR #169, eks-forge-catalog PR #371), in order, with what happened. Times are UTC.

## Setup

1. Deployed the full `dev` stack from the catalog branch `podinfo-alb-sli`, with `.app-of-apps-branch` set to the same branch and `PAGERDUTY_ENABLED=true` exported in the shell:
   ```bash
   cd pipelines/dev/eks/stack
   terragrunt stack generate
   terragrunt run --all apply --non-interactive --no-stack-generate
   ```
2. Pointed kubectl at the cluster, and checked that all 53 Argo CD apps were Synced and Healthy:
   ```bash
   aws eks update-kubeconfig --region us-east-1 --name dev-cluster
   kubectl get applications -n argocd
   ```
3. Port-forwarded YACE and Prometheus. Every query below runs against `localhost:19090`:
   ```bash
   kubectl port-forward -n yace svc/yace 15000:80
   kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 19090:9090
   ```
4. Installed k6 with `mise x aqua:grafana/k6@latest -- k6 version`. The script is [`scripts/k6/alb-load-test.js`](../scripts/k6/alb-load-test.js).

## 1. YACE Exports Nothing

`kubectl logs -n yace deploy/yace` showed `Couldn't get account Id ... STS: GetCallerIdentity ... i/o timeout` every scrape. YACE calls STS for the account ID before each discovery job and skips the job when the call fails (`pkg/job/scrape.go`). The network policy only allowed the `monitoring` and `tagging` endpoints.

Fix: `world` egress on 443 for STS, chosen over an STS endpoint (about $7/month per AZ), plus `disable-account-alias-lookup: true`.

After the fix, `curl localhost:15000/metrics | grep aws_applicationelb` listed the series, carrying `tag_eks_forge_io_slo_service="podinfo"`.

Found at the same time:
- The TC metric is `aws_applicationelb_target_response_time_tc__0_1_`, with two underscores, not three. Fixed in the SLO.
- `aws cloudwatch list-metrics` doesn't list `HTTPCode_Target_5XX_Count` while it's zero, so the `or vector(0)` fallback is needed on every 5XX term.

## 2. 5XX Discovery Delay (16:53)

Sent 2 minutes of 500s, the same as the Get Your First Page tutorial:
```bash
for i in $(seq 120); do curl -s -o /dev/null https://podinfo.public.dev.<base_domain>/status/500; sleep 1; done
```

`ListMetrics` listed `HTTPCode_Target_5XX_Count` and YACE exported it about 3 minutes after the first 500. `PodinfoAvailabilityBudgetBurn` fired as `critical` and `warning`, with a 5m error ratio of 0.84.

## 3. Run 1: ALB Counts Against k6 (16:58, 200 RPS, 10 min, Autoscaling On)

```bash
k6 run -e BASE_URL=https://podinfo.public.dev.<base_domain>/ -e RATE=200 -e DURATION=10m -e RTT_MS=100 --summary-export run1.json scripts/k6/alb-load-test.js
```

`RTT_MS=100` came from a 5 RPS baseline run, whose minimum time to first byte was 100.9ms.

Result, summed per minute with `aws_applicationelb_*{tag_eks_forge_io_slo_service="podinfo"}[11m]`:
- **Requests:** ALB `RequestCount` was 120,045, which is k6's 120,001 plus 44 blackbox probes (about 4 per minute). Exact.
- **Samples:** `TargetResponseTime` `SampleCount` = `RequestCount`.
- **Latency:** the ALB's fast ratio was 98.44%, k6's 97.79%. The gap comes from the laptop's round trip, which ranged from 19 to 101ms. The ALB numbers are the reference.
- podinfo stayed on 1 pod. 200 RPS is under KEDA's threshold of 300.

## 4. Run 2: Latency Page With Autoscaling Paused (17:12, 500 RPS)

```bash
kubectl annotate scaledobject podinfo -n podinfo autoscaling.keda.sh/paused-replicas="1" --overwrite
k6 run -e RATE=500 -e DURATION=20m ...
```

- **17:16:59:** `PodinfoLatencyBudgetBurn` fired as `critical`. In the first minute, the ALB counted 83% of requests over 100ms (901 fast out of 5,457 samples).
- **About 17:17:** the pod was OOMKilled at its 35M memory limit and went into CrashLoopBackOff. The availability page, `PodinfoDown` and `EndpointDown` fired as well. I stopped k6.
- **Old SLI:** Prometheus couldn't scrape the pod (`up{namespace="podinfo"} == 0`, connection refused). The old histogram SLI, and KEDA's RPS query, had no data.
- **502 and 504** don't appear in `TargetResponseTime`. In the 17:12 minute, `RequestCount` was 10,249 against a `SampleCount` of 5,457.
- **503** isn't counted in `RequestCount`, but it is in `HTTPCode_ELB_5XX_Count`. The availability error ratio went above 1.

Fix: added `HTTPCode_ELB_503_Count` to YACE and to the availability total.

## 5. PagerDuty Received Nothing

Alertmanager logged `unexpected status code 400: Event object is invalid: 'summary' is missing or blank`. The `slo` critical route had no `group_by`, so every SLO page shared one group, and `{{ .CommonAnnotations.summary }}` was empty whenever two different alerts fired together.

Fix: `group_by: [alertname]` on that route. After the config reloaded at 17:31, the two firing pages reached PagerDuty as separate incidents. No failures since.

## 6. Run 3: Outage (17:39, Paused at 0 Pods, 5 RPS)

```bash
kubectl annotate scaledobject podinfo -n podinfo autoscaling.keda.sh/paused-replicas="0" --overwrite
k6 run -e RATE=5 -e DURATION=10m ...
```

- **17:43:** the ELB 503 series was exported. The error ratio was 0.978, which stays ≤ 1 now that 503s are in the total.
- **17:45:24:** `PodinfoDown` fired and reached PagerDuty.
- **SLI empty:** with no pod, CloudWatch also stops publishing `RequestCount`, so the total was empty.

Fix: `or vector(0)` on the `RequestCount` term. Evaluating the new query at 17:46:30 returned 1, where the old one returned no data.

## 7. Runs 4 and 5: Latency Page Without a Crash (17:51)

Autoscaling paused at 1 pod both times.

| Run | RPS | Slow requests | Result |
|---|---|---|---|
| 4 | 380 | 83% in the first minute | OOMKilled within about 30s. The latency page at 17:55:39 came from this minute |
| 5 | 300 | 8.6%, then 4.4% | pod stable. The page needs over 14.4%, so it didn't fire |

So a latency page with no crash can't be reached with podinfo's current limits. That's tracked in #167.

YACE lagged up to about 5 minutes behind CloudWatch (publishing, the 120s `delay`, and one 60s poll), not about 3. The docs say 3 to 5 now.

## 8. Review Fix: NaN Total (18:25)

A total of 0/0 is NaN, and a single NaN 5m sample makes Sloth's 30d budget NaN for 30 days. The reviewer's single-selector total failed with `vector cannot contain metrics with the same labelset`. Used `(... or vector(0)) + (... or vector(0))) > 0` instead.

Retested:
- **Healthy:** ratio 0.
- **Paused at 0 pods with 5 RPS:** ratio 1 at 18:32, and `PodinfoDown` paged at 18:33.
- **YACE egress blocked** with a temporary `egressDeny` policy, deleted afterwards: ratio empty, not NaN.
- **NaN check:** no NaN 5m samples in the last hour (`count_over_time((x != x)[1h:])`), and the 30d ratio is a number.

## Not Run

- Terratest `TestStackExists`, which needs Tailscale.

## Where to Look

- **Grafana** (Dashboards, SLOs folder): **SLO / Detail**, service `podinfo`.
- **Prometheus:**
  - **Alerts** tab: search `Podinfo`.
  - `slo:sli_error:ratio_rate5m{sloth_service="podinfo"}`: what the alerts read.
  - `aws_applicationelb_*{tag_eks_forge_io_slo_service="podinfo"}`: per-minute counts. Use `sum_over_time`, never `rate`.
  - `up{namespace="podinfo"}`: 0 when the pod can't be scraped.
- **Alertmanager:** alert groups and receivers. Notify errors are in its logs (`grep -i pagerduty`).
- **Slack:** `#dev-slo-critical` and `#dev-slo-warning`.
- **PagerDuty:** service `dev-eks-forge`.
- **When a series is missing:**
  - `kubectl logs -n yace deploy/yace`
  - `aws cloudwatch list-metrics --namespace AWS/ApplicationELB`
  - `hubble observe -n yace --verdict DROPPED`
