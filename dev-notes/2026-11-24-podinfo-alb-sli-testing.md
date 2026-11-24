# Dev Note: Testing podinfo's ALB SLIs on `dev`

How to test every acceptance criterion of #166 (eks-forge-app-of-apps PR #169, eks-forge-catalog PR #371), in the order they were run on 2026-11-24, and what each test showed. The `dev` cluster used for these tests no longer exists. Everything here comes from what was recorded during the run.

The load comes from k6 run **locally** against podinfo's public ALB, with [`scripts/k6/alb-load-test.js`](../scripts/k6/alb-load-test.js). The in-cluster k6 CronJob calls podinfo's `Service` directly, so the ALB, and the SLIs measured there, never see its load.

Times are UTC. `T0` is the start of each test.

## Setup

1. In the catalog's `.env`, set `export PAGERDUTY_ENABLED=true`. In the catalog checkout root, put the app-of-apps branch name in `.app-of-apps-branch`. Then deploy `dev`, using the commands from [Run the Terragrunt Stack](https://eks-forge.readthedocs.io/latest/docs/deployment/#run-the-terragrunt-stack):
   ```bash
   source .env
   cd pipelines/dev/eks/stack
   terragrunt stack clean
   terragrunt stack generate
   terragrunt run --all apply --backend-bootstrap --non-interactive --no-stack-generate
   ```
2. Point kubectl at the cluster. Every Argo CD app must be Synced and Healthy:
   ```bash
   aws eks update-kubeconfig --region us-east-1 --name dev-cluster
   kubectl get applications -n argocd
   ```
3. Open Prometheus at `https://prometheus.private.dev.<base_domain>` over Tailscale, or port-forward it:
   ```bash
   kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 19090:9090
   ```
4. Check that YACE exports podinfo's ALB. This query must return series:
   ```promql
   aws_applicationelb_request_count_sum{tag_eks_forge_io_slo_service="podinfo"}
   ```
5. Install k6 with `mise x aqua:grafana/k6@latest -- k6 version`. Every `k6 run` below passes `-e BASE_URL=https://podinfo.public.dev.<base_domain>/` and `--summary-export <test>.json`.
6. Measure the laptop's round trip to the ALB, for `RTT_MS`. `time_connect` is one TCP handshake, so about one round trip:
   ```bash
   for i in $(seq 10); do curl -s -o /dev/null -w '%{time_connect}\n' https://podinfo.public.dev.<base_domain>/healthz; done
   ```
   On the day, `RTT_MS=100` came from a 5 RPS k6 run, whose minimum `http_req_waiting` was 100.9ms. The round trip varied from 19 to 101ms during the runs, so k6's fast and slow counts are approximate. The ALB's metrics are the reference.

To pause autoscaling at N pods (1 or 0), and to resume it after a test:
```bash
kubectl annotate scaledobject podinfo -n podinfo autoscaling.keda.sh/paused-replicas="<N>" --overwrite
kubectl annotate scaledobject podinfo -n podinfo autoscaling.keda.sh/paused-replicas-
```

CloudWatch data reaches Prometheus 3 to 5 minutes after the requests: CloudWatch's own publishing, YACE's 120s `delay`, and one 60s YACE poll. The Sloth alerts have no `for`, so they go straight from inactive to firing.

## What the Reader Sees per Alert

| Alert | `severity` | Slack title (`#dev-slo-critical` or `#dev-slo-warning`) | PagerDuty incident title |
|---|---|---|---|
| `PodinfoAvailabilityBudgetBurn` | `critical` | `[FIRING:1] PodinfoAvailabilityBudgetBurn (critical)` | `podinfo is burning its availability error budget` |
| `PodinfoAvailabilityBudgetBurn` | `warning` | `[FIRING:1] PodinfoAvailabilityBudgetBurn (warning)` | none, Slack only |
| `PodinfoLatencyBudgetBurn` | `critical` | `[FIRING:1] PodinfoLatencyBudgetBurn (critical)` | `podinfo is burning its latency error budget` |
| `PodinfoLatencyBudgetBurn` | `warning` | `[FIRING:1] PodinfoLatencyBudgetBurn (warning)` | none, Slack only |
| `PodinfoDown` | `critical` | `[FIRING:1] PodinfoDown (critical)` | `podinfo is unreachable` |

The Slack titles come from the `slack.default.title` template in `charts/monitoring/kube-prometheus-stack/values.yaml`. They weren't captured from Slack. The PagerDuty titles are each alert's `summary`. The `slo-warning` route has no `group_by`, so when two different SLO warnings fire together, their title loses the alert name: `[FIRING:2]  (warning)`.

Labels of a firing Sloth page in Prometheus:
```text
alertname="PodinfoLatencyBudgetBurn" component="slo" severity="critical" sloth_id="podinfo-requests-latency" sloth_service="podinfo" sloth_severity="page" sloth_slo="requests-latency"
```
`PodinfoDown` carries `component="slo" severity="critical" target="podinfo"`.

Grafana's **SLO / Detail** dashboard wasn't recorded during the tests.

## 1. The ALB Count Matches k6

**Steps:** with autoscaling on, run 10 minutes at 200 RPS (`T0` 16:58:22):
```bash
k6 run -e BASE_URL=... -e RATE=200 -e DURATION=10m -e RTT_MS=100 --summary-export run1.json scripts/k6/alb-load-test.js
```
Then sum the ALB's requests over the run's minutes, with `T` the end of the last minute:
```promql
sum(sum_over_time(aws_applicationelb_request_count_sum{tag_eks_forge_io_slo_service="podinfo"}[11m] @ T))
```

**Passes when** the ALB count equals k6's `http_reqs` plus the blackbox probes (about 4 per minute), within 1%, and `aws_applicationelb_target_response_time_sample_count` equals `RequestCount`.

**Result: pass.**
- **k6 summary:** `http_reqs` 120,001, `server_fast` 117,343, `server_slow` 2,658, `status_5xx` 0. `http_req_waiting`: min 18.7ms, median 112.1ms, p95 183.9ms.
- **ALB:** `RequestCount` 120,045 = 120,001 + 44 probes, matching minute by minute. `SampleCount` = `RequestCount` every minute.
- **Fast ratio:** 98.44% at the ALB, 97.79% from k6 after subtracting `RTT_MS`.
- **Ticket alert:** at T0 + 3:53 (17:02:15), the latency warning fired. One pod at 200 RPS had 1.56% slow requests, against a 1% objective.
- **Out-of-order window:** the exact count proves no YACE sample was dropped. To check directly, `prometheus_tsdb_head_out_of_order_samples_appended_total` read 757 (accepted through the window), while `prometheus_tsdb_out_of_order_samples_total` and `prometheus_target_scrapes_sample_duplicate_timestamp_total` both read 0.

## 2. The Availability Page

**Steps:** after a period with no 5xx, send 2 minutes of 500s (`T0` 16:53:28, the first 500):
```bash
for i in $(seq 120); do curl -s -o /dev/null https://podinfo.public.dev.<base_domain>/status/500; sleep 1; done
```

**Passes when** `PodinfoAvailabilityBudgetBurn` with `severity="critical"` fires and a PagerDuty incident opens on `dev-eks-forge`.

**Result: pass.**

| Event | Time | After `T0` |
|---|---|---|
| First 500 | 16:53:28 | 0:00 |
| Last 500 | 16:56:25 | 2:57 |
| `HTTPCode_Target_5XX_Count` listed by `ListMetrics` and exported by YACE | by 16:56:33 (first check) | ≤ 3:05 |
| Page (`critical`) and ticket (`warning`) both firing, 5m error ratio 0.84 | 16:57:15 | 3:47 |
| Alertmanager sends to PagerDuty and Slack | 16:57:48 | 4:20 |
| Page resolves | 17:02:00 | 5:35 after the last 500 |
| Ticket resolves | 17:03:00 | 6:35 after the last 500 |

No incident opened from this send. The PagerDuty account was on an expired trial at the time. Later pages arrived once it moved to the free plan. AWS allows a new metric up to 15 minutes to show up in `ListMetrics`, so after a long quiet period the page can come later than this.

## 3. The Latency Page

**Steps:** pause autoscaling at 1 pod, then send more than one pod handles. Watch the share of slow requests per minute:
```promql
1 - aws_applicationelb_target_response_time_tc__0_1_ / aws_applicationelb_target_response_time_sample_count
```

**Passes when** `PodinfoLatencyBudgetBurn` with `severity="critical"` fires and reaches PagerDuty. The page needs more than 14.4% of requests over 100ms.

**Result: pass.** On the day, podinfo's memory limit was 35M, so each run crashed the pod. This PR raises it to 100M, which these runs didn't test.

Run A, 500 RPS, `T0` 17:12:07:

| Event | Time | After `T0` |
|---|---|---|
| `EndpointDown`, then `PodinfoDown`, go pending (the pod fails its probes, then is OOMKilled and restarts in a loop) | 17:12:30, 17:13:00 | 0:23, 0:53 |
| Availability page fires (ALB 502, 503, and 504) | 17:16:15 | 4:08 |
| Latency page fires. The first minute had 83% slow requests (901 fast of 5,457) | 17:17:15 | 5:08 |
| `PodinfoDown` fires | 17:18:00 | 5:53 |
| k6 stopped | about 17:24 | |
| Latency page resolves | 17:46:30 | about 22 min after the load stopped |

The pages firing together were the availability page, the latency page, and `PodinfoDown`, plus `EndpointDown` on its own route. During the crash, `up{namespace="podinfo"}` was 0, so the old histogram SLI would have had no data.

Run B, 380 RPS, `T0` 17:51:54: OOMKilled within about 30 seconds (`PodinfoDown` pending 17:52:30 to 17:52:45). The latency page fired at 17:55:45, T0 + 3:51, from the minute before the crash. It resolved at 18:23:30.

Run C, 300 RPS, `T0` 17:52:59: the pod stayed up, with 8.6% then 4.4% slow requests. The latency page didn't fire, since that's below 14.4%.

Over all of Run A, CloudWatch counted 119,007 `HTTPCode_ELB_503_Count`, 15,322 502s, and 5,288 504s. 502s and 504s don't appear in `TargetResponseTime`, so only the availability SLI counts them. The k6 summaries of these runs weren't exported, because they were stopped early.

## 4. The Outage Page and SLI

**Steps:** pause autoscaling at 0 pods, then send light traffic, so the ALB answers with 503s (`T0` 18:27:01):
```bash
k6 run -e BASE_URL=... -e RATE=5 -e DURATION=10m scripts/k6/alb-load-test.js
```

**Passes when** `PodinfoDown` reaches PagerDuty within 10 minutes, and the availability SLI reads 1:
```promql
slo:sli_error:ratio_rate5m{sloth_service="podinfo", sloth_slo="requests-availability"}
```

**Result: pass.**

| Event | Time | After `T0` |
|---|---|---|
| `EndpointDown` pending, `PodinfoDown` pending | 18:27:30, 18:28:00 | 0:29, 0:59 |
| Availability page fires | 18:31:45 | 4:44 |
| Availability SLI reads 1 | by 18:32:38 | 5:37 |
| `PodinfoDown` fires | 18:33:00 | 5:59 |
| Alertmanager sends `PodinfoDown` to PagerDuty, incident `podinfo is unreachable` received | 18:33:48 | 6:47 |
| Autoscaling resumed | 18:33:25 | |
| `PodinfoDown` resolves | 18:35:45 | 2:20 after resume |

An earlier run of the same test (`T0` 17:39:29) went the same way. `PodinfoDown` fired at 17:45:30 and resolved at 17:47:45.

## 5. Two Pages at Once

**Steps:** none of its own. Test 3's Run A fires the availability page, the latency page, and `PodinfoDown` within 2 minutes of each other.

**Passes when** each page gets its own PagerDuty incident, and Alertmanager logs no `Notify for alerts failed` for `slo-critical-pagerduty`:
```bash
kubectl logs -n monitoring alertmanager-kube-prometheus-stack-alertmanager-0 -c alertmanager | grep -i pagerduty
```

**Result: pass,** once `group_by: [alertname]` was on the `slo` critical route. Alertmanager loaded it at 17:31. The two pages still firing then (availability and latency) each arrived as their own incident, and `PodinfoDown` arrived on its own in test 4.

## 6. The Error Ratio Stays Valid

**Steps:**
1. Read the availability SLI while healthy.
2. Read it during test 4.
3. Block YACE's egress for 2 minutes with this temporary policy, then delete it:
   ```yaml
   apiVersion: cilium.io/v2
   kind: CiliumNetworkPolicy
   metadata:
     name: tmp-test-yace-deny-egress
     namespace: yace
   spec:
     endpointSelector:
       matchLabels:
         app.kubernetes.io/name: yet-another-cloudwatch-exporter
     egressDeny:
       - toEntities: [all]
         toPorts:
           - ports:
               - port: "443"
                 protocol: TCP
   ```

**Passes when:**
- The SLI reads 0 while healthy, and 1 during the outage.
- It reads empty, not NaN, while YACE has no data.
- No 5m sample is NaN:
  ```promql
  count_over_time((slo:sli_error:ratio_rate5m{sloth_service="podinfo", sloth_slo="requests-availability"} != slo:sli_error:ratio_rate5m{sloth_service="podinfo", sloth_slo="requests-availability"})[1h:])
  ```

**Result: pass.**
- The SLI read 0 at 18:25, 1 at 18:32, and empty at 18:35:27, 2 minutes after the block started at 18:33:25.
- No 5m sample was NaN, and the 30d ratio stayed a number.
- While blocked, YACE logged only `Another scrape is already in process, will not start a new one`.

## Clean Up

```bash
kubectl annotate scaledobject podinfo -n podinfo autoscaling.keda.sh/paused-replicas-
kubectl delete ciliumnetworkpolicy tmp-test-yace-deny-egress -n yace --ignore-not-found
```

PagerDuty incidents resolve on their own once the alerts clear.

## Failure Symptoms

| Symptom | Cause |
|---|---|
| YACE logs `Couldn't get account Id ... operation error STS: GetCallerIdentity ... dial tcp ...:443: i/o timeout`, then `Another scrape is already in process`, and no `aws_applicationelb_*` series appears | No egress to STS. YACE needs the account ID before each discovery job, and skips the job without it |
| Only `Another scrape is already in process` in YACE's logs, and the series stop | All of YACE's egress is blocked |
| The latency SLI is empty, while `RequestCount` is present | Wrong TC metric name. It's `aws_applicationelb_target_response_time_tc__0_1_`, with two underscores |
| No `aws_applicationelb_httpcode_*` series in a healthy period | Normal: CloudWatch doesn't publish a 5XX metric at zero. The SLIs fall back to 0 |
| Alertmanager logs `notify retry canceled due to unrecoverable error after 1 attempts: unexpected status code 400: Event object is invalid: 'summary' is missing or blank`, and no incident opens | Two different SLO pages in one group, so `CommonAnnotations.summary` is empty. Needs `group_by: [alertname]` on the route |
| Prometheus returns `vector cannot contain metrics with the same labelset` for `sum(sum_over_time({__name__=~"aws_applicationelb_request_count_sum\|aws_applicationelb_httpcode_elb_503_count_sum", ...}[5m]))` | `sum_over_time` drops `__name__`, so the two series collide. That's why the total uses `((A or vector(0)) + (B or vector(0))) > 0` |
| The availability error ratio goes above 1 during an outage | ALB 503s are in `HTTPCode_ELB_5XX_Count` but not in `RequestCount`. The total adds `HTTPCode_ELB_503_Count` |
| podinfo is in `CrashLoopBackOff`, with `OOMKilled` under load | The memory limit is too low for open-model load. 35M crashed at 380 RPS |

## Site Pages This PR Makes Wrong

These pages belong to the `eks-forge` docs agent, and go in the site docs issue:
- **Get Your First Page** (catalog `docs/monitoring/paging.md`): podinfo's SLOs are measured at the ALB. The page fires about 4 minutes after the first 500, and resolves about 6 minutes after the last one, not about 30.
- **How SLO Alerting Works:** the SLIs come from the ALB's CloudWatch metrics through YACE, not from podinfo's histogram.
- **How Paging Works:** SLO pages are grouped per alert (`group_by: [alertname]`), one PagerDuty incident each.
