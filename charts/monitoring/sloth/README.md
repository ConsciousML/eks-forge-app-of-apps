<!-- This doc is aggregated into the EKS Forge documentation site: https://eks-forge.readthedocs.io/latest/docs/reference/helm_charts/monitoring/sloth/. It is not meant to be read directly in this repository. -->

# `sloth` Helm Chart Reference

The [`sloth` chart](./) deploys the [Sloth](https://sloth.dev/) controller via the upstream `sloth` chart. The controller turns each `PrometheusServiceLevel` into a `PrometheusRule` holding the SLI recording rules, one per window, and the multi-window multi-burn-rate page and ticket alerts. [Values](#values) lists only what this chart sets. For every other key, read the upstream [`values.yaml`](https://github.com/slok/sloth/blob/main/deploy/kubernetes/helm/sloth/values.yaml).

## What's Inside

- **[slos/](slos/)**: one `PrometheusServiceLevel` per service, as `<service>.yaml`, rendered as raw files by `templates/slos.yaml` so Sloth's `{{.window}}` variable reaches the controller unrendered
  - **[podinfo.yaml](slos/podinfo.yaml)**: podinfo's availability (non-5xx) and latency (100ms or less) SLOs, 99% over 30 days
- **[templates/network-policy.yaml](templates/network-policy.yaml)**: the controller's `CiliumNetworkPolicy`
- **[values.yaml](values.yaml)**: see [Values](#values)

## Alerts

Every SLO sets `component: slo` on its alerts. Page alerts carry `severity: critical`, and ticket alerts carry `severity: warning`. Alertmanager routes them to `#<environment>-slo-critical` and `#<environment>-slo-warning`.

| Alert | Burn rate | Long window | Short window |
|-------|-----------|-------------|--------------|
| Page  | 14.4x     | 1h          | 5m           |
| Page  | 6x        | 6h          | 30m          |
| Ticket| 3x        | 1d          | 2h           |
| Ticket| 1x        | 3d          | 6h           |

Windows are Sloth's defaults for a 30 day SLO period.

## Values

### Controller

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| sloth.resources | object | see values.yaml | Resource requests and limits. |
| sloth.securityContext | object | see values.yaml | Pod and container security contexts: non-root, read-only root filesystem, no capabilities. |
| sloth.nodeSelector | object | see values.yaml | Pins the controller to the `elastic` NodePool, with a matching `tolerations` entry. |
| sloth.commonPlugins | object | `{"enabled":false}` | Disables the common SLI plugins and their git-sync sidecar. |

## Upstream Dependencies

- **[`kube-prometheus-stack`](../kube-prometheus-stack)**: Prometheus loads the generated `PrometheusRule`s, Alertmanager routes the alerts by their `component: slo` label, and Grafana's **SLOs** folder holds Sloth's dashboards
