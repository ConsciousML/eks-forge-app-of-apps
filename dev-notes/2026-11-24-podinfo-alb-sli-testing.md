# Dev Note: Testing podinfo's ALB SLIs on `dev`

How to test every acceptance criterion of #166 (eks-forge-app-of-apps PR #169, eks-forge-catalog PR #371), in the order they were run on 2026-11-24. Each test lists its steps, what passes, and the result seen that day.

CloudWatch data reaches Prometheus 3 to 5 minutes after the requests. Every check below waits for it.

## Setup

1. Deploy `dev` from the catalog branch, with `.app-of-apps-branch` set to the same branch, and paging on:
   ```bash
   export PAGERDUTY_ENABLED=true
   cd pipelines/dev/eks/stack
   terragrunt stack generate
   terragrunt run --all apply --non-interactive --no-stack-generate
   ```
2. Point kubectl at the cluster, and check that every Argo CD app is Synced and Healthy:
   ```bash
   aws eks update-kubeconfig --region us-east-1 --name dev-cluster
   kubectl get applications -n argocd
   ```
3. Open Prometheus. Use `https://prometheus.private.dev.<base_domain>` over Tailscale, or a port-forward:
   ```bash
   kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 19090:9090
   ```
4. Check that YACE exports podinfo's ALB. This query should return series:
   ```promql
   aws_applicationelb_request_count_sum{tag_eks_forge_io_slo_service="podinfo"}
   ```
5. Install k6 with `mise x aqua:grafana/k6@latest -- k6 version`. The load test script is [`scripts/k6/alb-load-test.js`](../scripts/k6/alb-load-test.js). Every `k6 run` below targets `-e BASE_URL=https://podinfo.public.dev.<base_domain>/`.

To pause autoscaling at N pods (1 or 0), and to resume it after a test:
```bash
kubectl annotate scaledobject podinfo -n podinfo autoscaling.keda.sh/paused-replicas="<N>" --overwrite
kubectl annotate scaledobject podinfo -n podinfo autoscaling.keda.sh/paused-replicas-
```

## 1. The ALB Count Matches k6

**Steps:** with autoscaling on, run 10 minutes at 200 RPS:
```bash
k6 run -e BASE_URL=... -e RATE=200 -e DURATION=10m --summary-export run.json scripts/k6/alb-load-test.js
```
Then sum the ALB's requests over the run's minutes, with `T` the end of the last minute:
```promql
sum(sum_over_time(aws_applicationelb_request_count_sum{tag_eks_forge_io_slo_service="podinfo"}[11m] @ T))
```

**Passes when** the ALB count equals k6's `http_reqs` plus the blackbox probes (about 4 per minute), within 1%. `aws_applicationelb_target_response_time_sample_count` should equal `RequestCount`.

**Result:** pass. The ALB counted 120,045, which is k6's 120,001 plus 44 probes. `SampleCount` matched `RequestCount` every minute.

## 2. The Availability Page

**Steps:** send 2 minutes of 500s:
```bash
for i in $(seq 120); do curl -s -o /dev/null https://podinfo.public.dev.<base_domain>/status/500; sleep 1; done
```

**Passes when** `PodinfoAvailabilityBudgetBurn` with `severity="critical"` fires, and a PagerDuty incident opens on `dev-eks-forge`.

**Result:** pass. The alert fired within about 5 minutes of the first 500, with a 5m error ratio of 0.84.

## 3. The Latency Page

**Steps:** pause autoscaling at 1 pod, then send more than one pod handles:
```bash
k6 run -e BASE_URL=... -e RATE=380 -e DURATION=5m scripts/k6/alb-load-test.js
```
Watch the share of slow requests per minute:
```promql
1 - aws_applicationelb_target_response_time_tc__0_1_ / aws_applicationelb_target_response_time_sample_count
```

**Passes when** `PodinfoLatencyBudgetBurn` with `severity="critical"` fires and reaches PagerDuty. The page needs more than 14.4% of requests over 100ms.

**Result:** pass. 83% were slow in the first minute, and the page fired. At podinfo's 35M memory limit, the pod is OOMKilled about a minute into this load. 300 RPS stays below the page threshold (4 to 9% slow). A page with no crash is #167. During the crash, `up{namespace="podinfo"}` was 0: the old histogram SLI would have had no data.

## 4. The Outage Page and SLI

**Steps:** pause autoscaling at 0 pods, then send light traffic so the ALB answers with 503s:
```bash
k6 run -e BASE_URL=... -e RATE=5 -e DURATION=10m scripts/k6/alb-load-test.js
```

**Passes when** `PodinfoDown` reaches PagerDuty within 10 minutes, and the availability SLI reads 1:
```promql
slo:sli_error:ratio_rate5m{sloth_service="podinfo", sloth_slo="requests-availability"}
```

**Result:** pass. The SLI read 1 after about 5 minutes, and `PodinfoDown` fired after about 6.

## 5. Two Pages at Once

**Steps:** none of its own. Tests 3 and 4 fire several SLO pages at the same time.

**Passes when** each firing page has its own PagerDuty incident. Alertmanager's logs should show no `Notify for alerts failed` for `slo-critical-pagerduty`:
```bash
kubectl logs -n monitoring alertmanager-kube-prometheus-stack-alertmanager-0 -c alertmanager | grep -i pagerduty
```

**Result:** pass. The availability, latency, and `PodinfoDown` pages each arrived as their own incident.

## 6. The Error Ratio Stays Valid

**Steps:**
1. Check the availability SLI while healthy.
2. Read it during test 4.
3. Block YACE's egress for 5 minutes with a temporary policy, then delete it:
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

**Result:** pass. The SLI read 0, then 1, then empty. There were no NaN samples, and the 30d ratio stayed a number.

## Clean Up

```bash
kubectl annotate scaledobject podinfo -n podinfo autoscaling.keda.sh/paused-replicas-
kubectl delete ciliumnetworkpolicy tmp-test-yace-deny-egress -n yace --ignore-not-found
```

PagerDuty incidents resolve on their own once the alerts clear.

## Where to Look

- **Grafana** (Dashboards, SLOs folder): **SLO / Detail**, service `podinfo`. Shows the SLI, the burn rate, and the budget.
- **Prometheus:** the **Alerts** tab (search `Podinfo`), and the queries above. CloudWatch counts are per minute, so use `sum_over_time`, never `rate`.
- **Alertmanager** (`https://alertmanager.private.dev.<base_domain>`): alert groups and their receivers.
- **Slack:** `#dev-slo-critical` and `#dev-slo-warning`.
- **PagerDuty:** the `dev-eks-forge` service.
- **When a series is missing:**
  - `kubectl logs -n yace deploy/yace`
  - `aws cloudwatch list-metrics --namespace AWS/ApplicationELB`
  - `hubble observe -n yace --verdict DROPPED`
