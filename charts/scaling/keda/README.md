<!-- This doc is aggregated into the EKS Forge documentation site: https://eks-forge.readthedocs.io/latest/docs/reference/helm_charts/scaling/keda/. It is not meant to be read directly in this repository. -->

# `keda` Helm Chart Reference

The [`keda` chart](./) deploys [KEDA](https://keda.sh/) via the upstream `keda` chart. KEDA turns each `ScaledObject` into an HPA, and serves the HPA the trigger's metric through the `external.metrics.k8s.io` API. [Values](#values) lists only what this chart sets. For every other key, read the upstream [`values.yaml`](https://github.com/kedacore/charts/blob/main/keda/values.yaml).

Each app ships its own `ScaledObject` next to its manifests (e.g. [`manifests/podinfo/podinfo-scaledobject.yaml`](../../../manifests/podinfo/podinfo-scaledobject.yaml)). The CRDs are installed by [`crds-keda`](../../../manifests/crds/keda/), not by this chart.

## What's Inside

- **[templates/network-policy-operator.yaml](templates/network-policy-operator.yaml)**: the operator's `CiliumNetworkPolicy`, egress to Prometheus for the Prometheus scaler
- **[templates/network-policy-metrics-apiserver.yaml](templates/network-policy-metrics-apiserver.yaml)**: the metrics API server's `CiliumNetworkPolicy`
- **[templates/network-policy-admission-webhooks.yaml](templates/network-policy-admission-webhooks.yaml)**: the admission webhooks' `CiliumNetworkPolicy`
- **[values.yaml](values.yaml)**: see [Values](#values)

A trigger on a source other than Prometheus (e.g. SQS) needs a matching egress rule in `network-policy-operator.yaml`.

## Values

### Install

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| keda.crds | object | `{"install":false}` | Disabled. `crds-keda` owns the CRDs. |

### Pods

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| keda.resources | object | see values.yaml | Resource requests and limits of the operator, metrics API server, and admission webhooks. |
| keda.nodeSelector | object | see values.yaml | Pins every KEDA pod to the `elastic` NodePool, with a matching `tolerations` entry. |

### Monitoring

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| keda.prometheus | object | see values.yaml | Exposes the operator's metrics, scraped through a `ServiceMonitor`. |

## Upstream Dependencies

- **[`crds-keda`](../../../manifests/crds/keda/)**: installs the `ScaledObject`, `ScaledJob`, and `TriggerAuthentication` CRDs
- **[`kube-prometheus-stack`](../../monitoring/kube-prometheus-stack)**: Prometheus answers the Prometheus scaler queries, and scrapes the operator for the [`keda.yaml`](../../monitoring/prometheus-rules/keda.yaml) alerts
