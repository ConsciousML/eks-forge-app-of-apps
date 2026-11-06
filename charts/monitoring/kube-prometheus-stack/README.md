<!-- This doc is aggregated into the EKS Forge documentation site: https://eks-forge.readthedocs.io/latest/docs/reference/helm_charts/monitoring/kube-prometheus-stack/. It is not meant to be read directly in this repository. -->

# `kube-prometheus-stack` Helm Chart Reference

The [`kube-prometheus-stack` chart](./) deploys [kube-prometheus-stack](https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack) (Prometheus, Alertmanager, Grafana, and their operator) via the upstream chart. [Values](#values) lists only what this chart sets. For every other key, read the upstream [`values.yaml`](https://github.com/prometheus-community/helm-charts/blob/main/charts/kube-prometheus-stack/values.yaml).

For per-environment overrides, read [Configure an App per Environment](/docs/applications/configure-an-app-per-environment/).

## What's Inside

- **`templates/network-policy-*.yaml`**: one `CiliumNetworkPolicy` per component ([prometheus](templates/network-policy-prometheus.yaml), [alertmanager](templates/network-policy-alertmanager.yaml), [grafana](templates/network-policy-grafana.yaml), [operator](templates/network-policy-operator.yaml), [kube-state-metrics](templates/network-policy-kube-state-metrics.yaml))
- **[values.yaml](values.yaml)**: see [Values](#values)
- **[values.schema.json](values.schema.json)**: rejects the values the catalog injects via `appParams` when empty, so a missing injection fails the render
- **[placeholder-values.yaml](placeholder-values.yaml)**: used only by `scripts/validate-helm.sh`, so standalone `helm template` and kubeconform pass
- **[values-dev.yaml](values-dev.yaml)** and **[values-staging.yaml](values-staging.yaml)**: delete the Prometheus and Alertmanager PVCs on StatefulSet delete, retain them on scale-down
- **[values-prod.yaml](values-prod.yaml)**: retains the Prometheus and Alertmanager PVCs on StatefulSet delete and scale-down
- **[`secret-sync/grafana-secrets-values.yaml`](../../external-secrets-operator/secret-sync/grafana-secrets-values.yaml)**: loaded by this app via `extraValueFiles` in [`apps/values.yaml`](../../../apps/values.yaml), sets `grafana.admin.existingSecret` and `passwordKey` to the `Secret` that `grafana-secrets` syncs

## Values

### Alertmanager

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| kube-prometheus-stack.alertmanager.alertmanagerSpec.replicas | int | `3` | Alertmanager replicas, each with its own `gp3` PVC. Hard pod anti-affinity, spread across AZs, and a PDB keeping a majority up. |
| kube-prometheus-stack.alertmanager.alertmanagerSpec.secrets | list | see values.yaml | Mounts the Slack bot token and PagerDuty routing key `Secret`s. Each must match `targetSecretName` in `secret-sync/alertmanager-secrets-values.yaml` and `secret-sync/alertmanager-pagerduty-secrets-values.yaml`. |
| kube-prometheus-stack.alertmanager.config | object | see values.yaml | Slack routing tree, one `<environment>-<component>-<severity>` channel per route. Unmatched alerts go to `<environment>-unrouted`. |

### Release

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| kube-prometheus-stack.crds.enabled | bool | `false` | Disabled, the catalog's `prometheus_operator_crds` unit installs the CRDs before ArgoCD syncs. |
| kube-prometheus-stack.environment | string | `""` | Environment name, prefixes each Slack channel in `alertmanager.config`. Injected by the catalog via `appParams`. |
| kube-prometheus-stack.fullnameOverride | string | `""` | Names this chart's own resources. Must match `tool.helm.releaseName` in `apps/values.yaml`. Injected by the catalog via `appParams`. |
| kube-prometheus-stack.kubeEtcd | object | see values.yaml | Disabled with `kubeScheduler` and `kubeControllerManager`, AWS-managed on EKS. |
| kube-prometheus-stack.pagerduty.enabled | string | `nil` | Routes `slo` page alerts to PagerDuty on top of Slack. Injected by the catalog via `appParams`. |
| kube-prometheus-stack.pagerduty.eventsUrl | string | `""` | Events API v2 endpoint of the PagerDuty account's region. Injected by the catalog via `appParams`. |

### Alerting

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| kube-prometheus-stack.defaultRules.additionalRuleGroupLabels | object | see values.yaml | `component` label per default rule group, which Alertmanager routes on. |

### Grafana

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| kube-prometheus-stack.grafana.additionalDataSources | list | see values.yaml | Adds Loki as a datasource. Prometheus stays the default. |
| kube-prometheus-stack.grafana.admin.existingSecret | string | `""` | Admin credentials `Secret`, with `passwordKey`. Both set by `secret-sync/grafana-secrets-values.yaml`, loaded via `extraValueFiles`. |
| kube-prometheus-stack.grafana.dashboards | object | see values.yaml | Addon dashboards (Karpenter, ExternalDNS, AWS Load Balancer Controller, External Secrets Operator, ArgoCD, Loki, blackbox-exporter, and Sloth), each in its own folder from `dashboardProviders`. |

### Scheduling

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| kube-prometheus-stack.prometheus-node-exporter.priorityClassName | string | `"daemonset-critical"` | Lets a node-exporter pod preempt a lower-priority one on a full node. It tolerates both Karpenter NodePool taints and the MNG taint, so every node runs one. |
| kube-prometheus-stack.prometheus.prometheusSpec.nodeSelector | object | see values.yaml | Pins Prometheus to the `critical` NodePool, with a matching `tolerations` entry. Every component except node-exporter sets the same. |
| kube-prometheus-stack.prometheus.prometheusSpec.resources | object | see values.yaml | Resource requests and limits. Every component sets its own. |

### Prometheus

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| kube-prometheus-stack.prometheus.prometheusSpec.replicas | int | `2` | Prometheus replicas, each with its own PVC. Hard pod anti-affinity, spread across AZs, and a PDB keeping 1 up during disruption. |
| kube-prometheus-stack.prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues | bool | `false` | Picks up every `ServiceMonitor` regardless of labels. `podMonitorSelectorNilUsesHelmValues` and `ruleSelectorNilUsesHelmValues` do the same for `PodMonitor` and `PrometheusRule`. |
| kube-prometheus-stack.prometheus.prometheusSpec.storageSpec | object | see values.yaml | `gp3` PVC per replica. PVC retention is set per environment in `values-<env>.yaml`. |

### Other Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| kube-prometheus-stack.alertmanager.alertmanagerSpec.nodeSelector."karpenter.sh/nodepool" | string | `"critical"` |  |
| kube-prometheus-stack.alertmanager.alertmanagerSpec.podAntiAffinity | string | `"hard"` |  |
| kube-prometheus-stack.alertmanager.alertmanagerSpec.podDisruptionBudget.enabled | bool | `true` |  |
| kube-prometheus-stack.alertmanager.alertmanagerSpec.podDisruptionBudget.minAvailable | int | `2` |  |
| kube-prometheus-stack.alertmanager.alertmanagerSpec.resources.limits.cpu | string | `"11m"` |  |
| kube-prometheus-stack.alertmanager.alertmanagerSpec.resources.limits.memory | string | `"36M"` |  |
| kube-prometheus-stack.alertmanager.alertmanagerSpec.resources.requests.cpu | string | `"11m"` |  |
| kube-prometheus-stack.alertmanager.alertmanagerSpec.resources.requests.memory | string | `"36M"` |  |
| kube-prometheus-stack.alertmanager.alertmanagerSpec.storage.volumeClaimTemplate.spec.accessModes[0] | string | `"ReadWriteOnce"` |  |
| kube-prometheus-stack.alertmanager.alertmanagerSpec.storage.volumeClaimTemplate.spec.resources.requests.storage | string | `"10Gi"` |  |
| kube-prometheus-stack.alertmanager.alertmanagerSpec.storage.volumeClaimTemplate.spec.storageClassName | string | `"gp3"` |  |
| kube-prometheus-stack.alertmanager.alertmanagerSpec.tolerations[0].effect | string | `"NoSchedule"` |  |
| kube-prometheus-stack.alertmanager.alertmanagerSpec.tolerations[0].key | string | `"karpenter.sh/workload-class"` |  |
| kube-prometheus-stack.alertmanager.alertmanagerSpec.tolerations[0].operator | string | `"Equal"` |  |
| kube-prometheus-stack.alertmanager.alertmanagerSpec.tolerations[0].value | string | `"critical"` |  |
| kube-prometheus-stack.alertmanager.alertmanagerSpec.topologySpreadConstraints[0].maxSkew | int | `1` |  |
| kube-prometheus-stack.alertmanager.alertmanagerSpec.topologySpreadConstraints[0].topologyKey | string | `"topology.kubernetes.io/zone"` |  |
| kube-prometheus-stack.alertmanager.alertmanagerSpec.topologySpreadConstraints[0].whenUnsatisfiable | string | `"DoNotSchedule"` |  |
| kube-prometheus-stack.alertmanager.templateFiles."slack.tmpl" | string | `"{{ define \"slack.default.title\" }}[{{ .Status | toUpper }}{{ if eq .Status \"firing\" }}:{{ .Alerts.Firing | len }}{{ end }}] {{ .CommonLabels.alertname }} ({{ .CommonLabels.severity }})\n{{ end }}\n{{ define \"slack.default.text\" }}\n{{ range .Alerts }}*{{ .Annotations.summary }}*\n{{ .Annotations.description }}\n{{ end }}\n{{ end }}"` |  |
| kube-prometheus-stack.alertmanager.tplConfig | bool | `true` |  |
| kube-prometheus-stack.grafana.admin.passwordKey | string | `""` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".apiVersion | int | `1` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[0].folder | string | `"Karpenter"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[0].name | string | `"karpenter"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[0].options.path | string | `"/var/lib/grafana/dashboards/karpenter"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[0].orgId | int | `1` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[0].type | string | `"file"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[1].folder | string | `"External DNS"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[1].name | string | `"external-dns"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[1].options.path | string | `"/var/lib/grafana/dashboards/external-dns"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[1].orgId | int | `1` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[1].type | string | `"file"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[2].folder | string | `"AWS Load Balancer Controller"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[2].name | string | `"aws-lbc"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[2].options.path | string | `"/var/lib/grafana/dashboards/aws-lbc"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[2].orgId | int | `1` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[2].type | string | `"file"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[3].folder | string | `"External Secrets Operator"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[3].name | string | `"eso"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[3].options.path | string | `"/var/lib/grafana/dashboards/eso"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[3].orgId | int | `1` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[3].type | string | `"file"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[4].folder | string | `"ArgoCD"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[4].name | string | `"argocd"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[4].options.path | string | `"/var/lib/grafana/dashboards/argocd"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[4].orgId | int | `1` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[4].type | string | `"file"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[5].folder | string | `"Loki"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[5].name | string | `"loki"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[5].options.path | string | `"/var/lib/grafana/dashboards/loki"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[5].orgId | int | `1` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[5].type | string | `"file"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[6].folder | string | `"Blackbox Exporter"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[6].name | string | `"blackbox-exporter"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[6].options.path | string | `"/var/lib/grafana/dashboards/blackbox-exporter"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[6].orgId | int | `1` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[6].type | string | `"file"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[7].folder | string | `"SLOs"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[7].name | string | `"sloth"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[7].options.path | string | `"/var/lib/grafana/dashboards/sloth"` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[7].orgId | int | `1` |  |
| kube-prometheus-stack.grafana.dashboardProviders."dashboardproviders.yaml".providers[7].type | string | `"file"` |  |
| kube-prometheus-stack.grafana.downloadDashboards.securityContext.readOnlyRootFilesystem | bool | `true` |  |
| kube-prometheus-stack.grafana.env.GF_SECURITY_ADMIN_USER | string | `"admin"` |  |
| kube-prometheus-stack.grafana.nodeSelector."karpenter.sh/nodepool" | string | `"critical"` |  |
| kube-prometheus-stack.grafana.persistence.enabled | bool | `false` |  |
| kube-prometheus-stack.grafana.resources.limits.cpu | string | `"115m"` |  |
| kube-prometheus-stack.grafana.resources.limits.memory | string | `"443M"` |  |
| kube-prometheus-stack.grafana.resources.requests.cpu | string | `"23m"` |  |
| kube-prometheus-stack.grafana.resources.requests.memory | string | `"443M"` |  |
| kube-prometheus-stack.grafana.sidecar.dashboards.env.REQ_USERNAME | string | `"admin"` |  |
| kube-prometheus-stack.grafana.sidecar.dashboards.folderAnnotation | string | `"grafana_folder"` |  |
| kube-prometheus-stack.grafana.sidecar.dashboards.provider.foldersFromFilesStructure | bool | `true` |  |
| kube-prometheus-stack.grafana.sidecar.datasources.env.REQ_USERNAME | string | `"admin"` |  |
| kube-prometheus-stack.grafana.sidecar.resources.limits.cpu | string | `"175m"` |  |
| kube-prometheus-stack.grafana.sidecar.resources.limits.memory | string | `"249M"` |  |
| kube-prometheus-stack.grafana.sidecar.resources.requests.cpu | string | `"35m"` |  |
| kube-prometheus-stack.grafana.sidecar.resources.requests.memory | string | `"249M"` |  |
| kube-prometheus-stack.grafana.sidecar.securityContext.readOnlyRootFilesystem | bool | `true` |  |
| kube-prometheus-stack.grafana.tolerations[0].effect | string | `"NoSchedule"` |  |
| kube-prometheus-stack.grafana.tolerations[0].key | string | `"karpenter.sh/workload-class"` |  |
| kube-prometheus-stack.grafana.tolerations[0].operator | string | `"Equal"` |  |
| kube-prometheus-stack.grafana.tolerations[0].value | string | `"critical"` |  |
| kube-prometheus-stack.kube-state-metrics.nodeSelector."karpenter.sh/nodepool" | string | `"critical"` |  |
| kube-prometheus-stack.kube-state-metrics.resources.limits.cpu | string | `"55m"` |  |
| kube-prometheus-stack.kube-state-metrics.resources.limits.memory | string | `"100M"` |  |
| kube-prometheus-stack.kube-state-metrics.resources.requests.cpu | string | `"11m"` |  |
| kube-prometheus-stack.kube-state-metrics.resources.requests.memory | string | `"37M"` |  |
| kube-prometheus-stack.kube-state-metrics.tolerations[0].effect | string | `"NoSchedule"` |  |
| kube-prometheus-stack.kube-state-metrics.tolerations[0].key | string | `"karpenter.sh/workload-class"` |  |
| kube-prometheus-stack.kube-state-metrics.tolerations[0].operator | string | `"Equal"` |  |
| kube-prometheus-stack.kube-state-metrics.tolerations[0].value | string | `"critical"` |  |
| kube-prometheus-stack.kubeControllerManager.enabled | bool | `false` |  |
| kube-prometheus-stack.kubeScheduler.enabled | bool | `false` |  |
| kube-prometheus-stack.prometheus-node-exporter.resources.limits.cpu | string | `"55m"` |  |
| kube-prometheus-stack.prometheus-node-exporter.resources.limits.memory | string | `"24M"` |  |
| kube-prometheus-stack.prometheus-node-exporter.resources.requests.cpu | string | `"11m"` |  |
| kube-prometheus-stack.prometheus-node-exporter.resources.requests.memory | string | `"24M"` |  |
| kube-prometheus-stack.prometheus-node-exporter.tolerations[0].effect | string | `"NoSchedule"` |  |
| kube-prometheus-stack.prometheus-node-exporter.tolerations[0].key | string | `"karpenter.sh/workload-class"` |  |
| kube-prometheus-stack.prometheus-node-exporter.tolerations[0].operator | string | `"Exists"` |  |
| kube-prometheus-stack.prometheus-node-exporter.tolerations[1].effect | string | `"NoSchedule"` |  |
| kube-prometheus-stack.prometheus-node-exporter.tolerations[1].key | string | `"node-role/mng"` |  |
| kube-prometheus-stack.prometheus-node-exporter.tolerations[1].operator | string | `"Equal"` |  |
| kube-prometheus-stack.prometheus-node-exporter.tolerations[1].value | string | `"true"` |  |
| kube-prometheus-stack.prometheus.prometheusSpec.podAntiAffinity | string | `"hard"` |  |
| kube-prometheus-stack.prometheus.prometheusSpec.podDisruptionBudget.enabled | bool | `true` |  |
| kube-prometheus-stack.prometheus.prometheusSpec.podDisruptionBudget.minAvailable | int | `1` |  |
| kube-prometheus-stack.prometheus.prometheusSpec.podMonitorSelectorNilUsesHelmValues | bool | `false` |  |
| kube-prometheus-stack.prometheus.prometheusSpec.ruleSelectorNilUsesHelmValues | bool | `false` |  |
| kube-prometheus-stack.prometheus.prometheusSpec.tolerations[0].effect | string | `"NoSchedule"` |  |
| kube-prometheus-stack.prometheus.prometheusSpec.tolerations[0].key | string | `"karpenter.sh/workload-class"` |  |
| kube-prometheus-stack.prometheus.prometheusSpec.tolerations[0].operator | string | `"Equal"` |  |
| kube-prometheus-stack.prometheus.prometheusSpec.tolerations[0].value | string | `"critical"` |  |
| kube-prometheus-stack.prometheus.prometheusSpec.topologySpreadConstraints[0].additionalLabelSelectors | string | `"OnResource"` |  |
| kube-prometheus-stack.prometheus.prometheusSpec.topologySpreadConstraints[0].maxSkew | int | `1` |  |
| kube-prometheus-stack.prometheus.prometheusSpec.topologySpreadConstraints[0].topologyKey | string | `"topology.kubernetes.io/zone"` |  |
| kube-prometheus-stack.prometheus.prometheusSpec.topologySpreadConstraints[0].whenUnsatisfiable | string | `"DoNotSchedule"` |  |
| kube-prometheus-stack.prometheus.service.sessionAffinity | string | `"ClientIP"` |  |
| kube-prometheus-stack.prometheusConfigReloader.resources.limits.cpu | string | `"11m"` |  |
| kube-prometheus-stack.prometheusConfigReloader.resources.limits.memory | string | `"24M"` |  |
| kube-prometheus-stack.prometheusConfigReloader.resources.requests.cpu | string | `"11m"` |  |
| kube-prometheus-stack.prometheusConfigReloader.resources.requests.memory | string | `"24M"` |  |
| kube-prometheus-stack.prometheusOperator.admissionWebhooks.patch.nodeSelector."karpenter.sh/nodepool" | string | `"critical"` |  |
| kube-prometheus-stack.prometheusOperator.admissionWebhooks.patch.tolerations[0].effect | string | `"NoSchedule"` |  |
| kube-prometheus-stack.prometheusOperator.admissionWebhooks.patch.tolerations[0].key | string | `"karpenter.sh/workload-class"` |  |
| kube-prometheus-stack.prometheusOperator.admissionWebhooks.patch.tolerations[0].operator | string | `"Equal"` |  |
| kube-prometheus-stack.prometheusOperator.admissionWebhooks.patch.tolerations[0].value | string | `"critical"` |  |
| kube-prometheus-stack.prometheusOperator.nodeSelector."karpenter.sh/nodepool" | string | `"critical"` |  |
| kube-prometheus-stack.prometheusOperator.resources.limits.cpu | string | `"11m"` |  |
| kube-prometheus-stack.prometheusOperator.resources.limits.memory | string | `"50M"` |  |
| kube-prometheus-stack.prometheusOperator.resources.requests.cpu | string | `"11m"` |  |
| kube-prometheus-stack.prometheusOperator.resources.requests.memory | string | `"50M"` |  |
| kube-prometheus-stack.prometheusOperator.tolerations[0].effect | string | `"NoSchedule"` |  |
| kube-prometheus-stack.prometheusOperator.tolerations[0].key | string | `"karpenter.sh/workload-class"` |  |
| kube-prometheus-stack.prometheusOperator.tolerations[0].operator | string | `"Equal"` |  |
| kube-prometheus-stack.prometheusOperator.tolerations[0].value | string | `"critical"` |  |

## Resource Names

`fullnameOverride` only names this chart's own resources: the `prometheus`, `alertmanager`, and operator objects. Grafana, `kube-state-metrics`, and `node-exporter` are bundled subcharts that derive their resource names from the Helm release name instead. Anything referencing those names, like an [`httproute`](../../gateway-api/httproute) `backendRef`, must match `tool.helm.releaseName` in `apps/values.yaml`, or it silently points at the wrong Service.

## Upstream Dependencies

- **[`prometheus_stack`](https://github.com/ConsciousML/eks-forge-catalog/tree/main/units/eks/addons/prometheus_stack)** (catalog): `grafana/aws_secret_password` generates the admin password that `grafana-secrets` syncs in
- **[`app_of_apps`](https://github.com/ConsciousML/eks-forge-catalog/blob/main/units/eks/addons/argocd/app_of_apps/terragrunt.hcl)** (catalog): injects `fullnameOverride`, `environment`, and the Prometheus and Alertmanager `externalUrl` via `appParams`
- **[`storage-class-gp3`](../../../manifests/storage-class-gp3)**: provisions the `gp3` `StorageClass` both `prometheus` and `alertmanager` request for their persistent volumes
- **[`alertmanager-secrets`](../../external-secrets-operator/secret-sync/alertmanager-secrets-values.yaml)**: syncs the Slack bot token `Secret` Alertmanager mounts
