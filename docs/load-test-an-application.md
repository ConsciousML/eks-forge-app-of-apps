{/* This doc is aggregated into the EKS Forge documentation site: https://eks-forge.readthedocs.io/latest/. It is not meant to be read directly in this repository. */}

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# How to Load Test an Application

This guide shows you how to size an app's autoscaling from a load test: send load to one pod with [k6](https://grafana.com/docs/k6/latest/) from inside the cluster, find how much it handles within its SLO, then scale on that. You need it when you add an app that must scale with its traffic, or before a release changes how it handles load. It assumes you've created a branch in your app of apps fork, as in [Point Dev at Your Branch](/docs/applications/add-edit-or-remove-an-app/#point-dev-at-your-branch).

If you're new to load testing in EKS Forge, read [How Load Testing Works](/docs/applications/load-testing/how-load-testing-works/) first.

Every file below goes next to your app's files: in `manifests/<name>/` for plain manifests, or in `templates/` for a Helm chart.

## Define the Target

Write down two things before any test:
- **The SLO**: what users must get, e.g. 99% of requests in 100ms or less. If the app has SLOs already, use them (see [Add an SLO & Page Alert](/docs/monitoring/paging/add-an-slo-and-page-alert/)).
- **The traffic pattern**: the expected peak, how fast traffic ramps up to it, and whether it comes in bursts.

## Check What Scaling Can't Fix

More pods only help if the app is stateless: any pod can serve any request, and a pod can be removed at any time.

Then list what the app calls downstream (a database, a queue, another service). Adding pods doesn't scale them. Each new pod also opens its own connections, so a scale out can exhaust a database's connection limit. Cap `maxReplicas` (or `maxReplicaCount`) at what the slowest downstream dependency can serve.

## Look at the Current Traffic

If the app already runs, open its dashboards in Grafana (see [Explore Your Metrics](/docs/monitoring/get-started/metrics/)) and note its peak requests per second, its latency, and its pods' CPU and memory usage. If it doesn't run yet, deploy it to `dev` first, by following [Test in Dev](/docs/applications/add-edit-or-remove-an-app/#test-in-dev).

## Right-Size the Pod

Set the container's CPU and memory `requests` from its Goldilocks recommendation, by following [Right-Size a Workload](/docs/compute/right-size-a-workload/). Do it before measuring a pod's capacity: with a CPU limit, the CPU a pod gets caps the load it handles, so a capacity measured before right-sizing no longer holds after.

## Add the Load Test

A load test is a k6 script, a suspended `CronJob` that runs it, and a network policy that lets k6 reach your app.

### Write the k6 Script

Add a `ConfigMap` named `k6-loadtest-script`, holding the script under its `script.js` key. In the script, set:
- The URL of your app's `Service`, as `http://<service>.<namespace>.svc.cluster.local:<port>/`, with the `Service` port.
- The `stages`: each one ramps the number of virtual users to its `target`, over its `duration`.

For example, [`manifests/podinfo/k6-loadtest-script.yaml`](../manifests/podinfo/k6-loadtest-script.yaml) ramps up to 50 virtual users, then back down:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: k6-loadtest-script
data:
  script.js: |
    import http from 'k6/http';

    export const options = {
      scenarios: {
        gaussian_load: {
          executor: 'ramping-vus',
          startVUs: 0,
          stages: [
            { duration: '45s', target: 2 },
            ...
            { duration: '45s', target: 50 },
            ...
            { duration: '45s', target: 2 },
          ],
          gracefulRampDown: '15s',
        },
      },
    };

    export default function () {
      http.get('http://podinfo.podinfo.svc.cluster.local:9898/');
    }
```

For another load shape, see k6's [Executors](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/).

### Add the CronJob

Copy [`manifests/podinfo/k6-loadtest-cronjob.yaml`](../manifests/podinfo/k6-loadtest-cronjob.yaml) next to your app's files, unchanged. It's suspended, so it never runs on its own, and it mounts the `k6-loadtest-script` `ConfigMap`:
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: k6-loadtest
spec:
  schedule: "0 0 1 1 *"
  suspend: true
  jobTemplate:
    spec:
      backoffLimit: 0
      template:
        metadata:
          labels:
            app.kubernetes.io/name: k6-loadtest
        spec:
          ...
          containers:
            - name: k6
              image: grafana/k6
              command: ["k6", "run", "/script/script.js"]
              ...
          volumes:
            - name: script
              configMap:
                name: k6-loadtest-script
            ...
```

For its other fields, see Kubernetes' [CronJob](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/) docs.

It runs k6 on the `elastic` NodePool. To place it elsewhere, see [Schedule Pods](/docs/compute/schedule-pods/).

### Allow the Traffic

Your namespace denies all traffic by default, so allow k6's requests at both ends. If your app has no network policy yet, follow [Write Network Policies](/docs/security/write-network-policies/) first.

Copy [`manifests/podinfo/k6-loadtest-network-policy.yaml`](../manifests/podinfo/k6-loadtest-network-policy.yaml) next to your app's files. Under `egress`, set your app's pod labels and its container port, not the `Service` port:
```yaml
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: k6-loadtest
spec:
  endpointSelector:
    matchLabels:
      app.kubernetes.io/name: k6-loadtest
  egress:
    - toEndpoints:
        - matchLabels:
            app: podinfo
      toPorts:
        - ports:
            - port: "9898"
              protocol: TCP
```

Then, in your app's own policy, allow ingress from k6 on the same port. For example, in [`manifests/podinfo/podinfo-network-policy.yaml`](../manifests/podinfo/podinfo-network-policy.yaml):
```yaml
  ingress:
    ...
    - fromEndpoints:
        - matchLabels:
            app.kubernetes.io/name: k6-loadtest
      toPorts:
        - ports:
            - port: "9898"
              protocol: TCP
```

### Deploy to Dev

Deploy your change to `dev` by following [Test in Dev](/docs/applications/add-edit-or-remove-an-app/#test-in-dev), up to the sync. Then check that the `CronJob` exists, with `True` in its `SUSPEND` column, replacing `<namespace>` with your app's namespace:
```bash
kubectl get cronjob k6-loadtest -n <namespace>
```

## Run the Load Test

Create a `Job` from the `CronJob`, replacing `<job>` with a name for this run (e.g. `k6-loadtest-1`):
```bash
kubectl create job --from=cronjob/k6-loadtest <job> -n <namespace>
```

Each run needs a new name, unless you delete the previous `Job` first (see [Clean Up](#clean-up)).

## Find One Pod's Capacity

Pause autoscaling at one pod, so the whole load lands on it:

<Tabs groupId="autoscaler">
<TabItem value="hpa" label="HPA">

Set `minReplicas` and `maxReplicas` to `1` in your HPA, then push and sync.

</TabItem>
<TabItem value="keda" label="KEDA">

Annotate your `ScaledObject`. KEDA holds the replicas at the annotation's value until you remove it:
```bash
kubectl annotate scaledobject <name> -n <namespace> autoscaling.keda.sh/paused-replicas="1"
```

</TabItem>
</Tabs>

If your app has no autoscaler yet, it already runs one pod, as long as its `Deployment` sets no `replicas` above `1`.

Run the load test (see [Run the Load Test](#run-the-load-test)). Its `stages` must ramp past what one pod handles, so the latency breaks before the end of the run.

Then, in Prometheus (see [Explore Your Metrics](/docs/monitoring/get-started/metrics/)), graph the pod's requests per second and the share of requests within the SLO's latency. For example, for podinfo's SLO of 100ms or less:
```promql
sum(rate(http_request_duration_seconds_count{namespace="podinfo", path!~"healthz|readyz|metrics"}[1m]))

sum(rate(http_request_duration_seconds_bucket{namespace="podinfo", path!~"healthz|readyz|metrics", le="0.1"}[1m]))
/
sum(rate(http_request_duration_seconds_count{namespace="podinfo", path!~"healthz|readyz|metrics"}[1m]))
```

The pod's capacity is the highest requests per second before either the second query drops below the SLO's objective (e.g. `0.99`), or the requests per second stop growing while k6 keeps adding virtual users. Then check k6's `http_req_duration` in its summary. The app's own histogram only times requests once its handler starts, so it misses the time requests wait in a saturated pod.

For example, one podinfo pod plateaus at about 430 requests per second, its CPU pinned at its `50m` limit, while its own histogram still shows 99% of requests in 100ms or less.

Resume autoscaling afterwards: revert the HPA change, or remove the annotation with `kubectl annotate scaledobject <name> -n <namespace> autoscaling.keda.sh/paused-replicas-`.

## Pick the Scaling Metric

Pick the metric that grows with the load of your app, and set its target at about 70% of the pod's capacity. The rest is headroom for the traffic that arrives while new pods start.

| Workload | Metric | Autoscaler |
|----------|--------|------------|
| CPU-bound requests (e.g. encoding, compression) | CPU usage | HPA |
| Short requests of similar cost | Requests per second per pod | KEDA, `prometheus` trigger |
| Requests that wait on a database or another service | In-flight requests per pod, if the app exposes them | KEDA, `prometheus` trigger |
| Queue workers | Queue depth (e.g. SQS messages visible) | KEDA, the queue's scaler |
| Inference servers | Requests waiting in the server's queue | KEDA, `prometheus` trigger |

CPU is a poor signal for anything not CPU-bound: a pod waiting on its database uses little CPU while its latency breaks the SLO.

For podinfo, the target is 300 requests per second per pod, about 70% of its 430.

## Add the Autoscaler

<Tabs groupId="autoscaler">
<TabItem value="hpa" label="HPA">

Add a [`HorizontalPodAutoscaler`](https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/) that targets your app's `Deployment`, with its range of replicas and the CPU usage to hold:
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: <name>
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: <name>
  minReplicas: 1
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

The HPA measures usage as a share of the CPU `requests`, so set one on every container.

</TabItem>
<TabItem value="keda" label="KEDA">

Add a [KEDA `ScaledObject`](https://keda.sh/docs/latest/reference/scaledobject-spec/) that targets your app's `Deployment`. KEDA creates and owns the HPA. For example, podinfo scales on its requests per second, in [`manifests/podinfo/podinfo-scaledobject.yaml`](../manifests/podinfo/podinfo-scaledobject.yaml):
```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: podinfo
spec:
  scaleTargetRef:
    name: podinfo
  minReplicaCount: 1
  maxReplicaCount: 10
  fallback:
    failureThreshold: 3
    replicas: 1
    behavior: currentReplicasIfHigher
  triggers:
    - type: prometheus
      metadata:
        serverAddress: http://kube-prometheus-stack-prometheus.monitoring.svc.cluster.local:9090
        query: sum(rate(http_request_duration_seconds_count{namespace="podinfo", path!~"healthz|readyz|metrics"}[1m]))
        threshold: "300"
  ...
```

In it:
- `query` returns the total for all pods. KEDA divides it by the number of replicas and compares the result to `threshold`, the target per pod.
- `fallback` applies when KEDA can't read the metric (e.g. Prometheus is down) 3 times in a row. `currentReplicasIfHigher` keeps the current replicas, or `replicas` if there are fewer, so the app never scales down while KEDA can't see its load.
- An empty result (no series yet, e.g. before the first request) reads as `0`, so the app scales down to `minReplicaCount`.

For another trigger, see KEDA's [Scalers](https://keda.sh/docs/latest/scalers/). A trigger on a source other than Prometheus needs a matching egress rule in [`charts/scaling/keda/templates/network-policy-operator.yaml`](../charts/scaling/keda/templates/network-policy-operator.yaml), and AWS sources need permissions (see [Pass Terraform Values to an App](/docs/applications/pass-terraform-values-to-an-app/)).

</TabItem>
</Tabs>

In the `Deployment`, remove `replicas`. The HPA sets it, and ArgoCD would revert it to the manifest's value on every sync.

## Prepare for the Scale Out

Before trusting the autoscaler:
- Set a `readinessProbe`, so a new pod only receives traffic once it can serve it.
- In `prod`, set `minReplicas` (or `minReplicaCount`) to at least `2`, so one pod's failure or eviction never takes the app down (see [Configure an App per Environment](/docs/applications/configure-an-app-per-environment/)).
- Keep the app on a NodePool Karpenter scales (e.g. `elastic`), so new pods get nodes instead of staying `Pending` (see [Schedule Pods](/docs/compute/schedule-pods/)).

## Load Test Past the Peak

Edit the `stages` to ramp past the expected peak, then push, sync, and run the load test again.

Follow k6's output. It ends with a summary of the run, including the share of failed requests (`http_req_failed`) and the response times (`http_req_duration`):
```bash
kubectl logs -f job/<job> -n <namespace>
```

In another terminal, watch the HPA add replicas as the load grows, then remove them:
```bash
kubectl get hpa -n <namespace> -w
```

If its `TARGETS` column still shows `<unknown>` after a minute, the HPA can't read its metric. For an HPA on CPU, its events say why, most often a container with no CPU `requests`:
```bash
kubectl describe hpa -n <namespace>
```

For a `ScaledObject`, its conditions say why, and the KEDA operator's logs hold the error of the trigger:
```bash
kubectl describe scaledobject <name> -n <namespace>
kubectl logs -n keda -l app.kubernetes.io/name=keda-operator
```

If every request fails, a network policy is dropping them. See [Find Dropped Traffic](/docs/security/write-network-policies/#find-dropped-traffic).

During the run, check that no SLO burn-rate alert fires (see [Add an SLO & Page Alert](/docs/monitoring/paging/add-an-slo-and-page-alert/)). If one fires, the app scaled too late: lower the target, raise `minReplicas`, or check what kept new pods from starting. Then run again.

## Promote to Prod

Open a pull request and merge it, as in [Open a Pull Request](/docs/applications/add-edit-or-remove-an-app/#open-a-pull-request). The autoscaler and the `CronJob` ship to `staging` and `prod` with your next release. The `CronJob` stays suspended there until someone triggers it.

After the release, watch the app's dashboards and the SLO alerts under real traffic, and adjust the target if real requests cost more or less than the test's.

## Clean Up

Delete each `Job` once you've read its output:
```bash
kubectl delete job <job> -n <namespace>
```
