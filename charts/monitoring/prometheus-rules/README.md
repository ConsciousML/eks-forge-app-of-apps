<!-- This doc is aggregated into the EKS Forge documentation site: https://eks-forge.readthedocs.io/latest/docs/reference/helm_charts/monitoring/prometheus-rules/. It is not meant to be read directly in this repository. -->

# prometheus-rules

Standalone `PrometheusRule` manifests, one per component, for alerts not bundled by a Helm chart.

## What's Inside

- **[argocd.yaml](argocd.yaml)**: from [argo-cd-mixin](https://github.com/adinhodovic/argo-cd-mixin), the same mixin behind the `argocd` Grafana dashboards in `kube-prometheus-stack/values.yaml`. Labeled `component: argocd` for Alertmanager's routing tree (see `kube-prometheus-stack/values.yaml`).
- **[alloy.yaml](alloy.yaml)**: the `alloy_controller` group from [alloy-mixin](https://github.com/grafana/alloy/tree/main/operations/alloy-mixin), component-health alerts for Alloy's own pipeline (clustering and OpenTelemetry groups excluded, unused here). Labeled `component: loki` to route alongside Loki's own alerts.
- **[cilium.yaml](cilium.yaml)**: from the Cilium rules of [awesome-prometheus-alerts](https://github.com/samber/awesome-prometheus-alerts), verified against the pinned Cilium chart version's metrics (`version_cilium` in the catalog repo). Rules for IPAM, ClusterMesh, DNS, and NAT are excluded, their metrics don't exist in `aws-cni` chaining mode. `CiliumOperatorUnmanagedPods` is added. Labeled `component: k8s`, Cilium is core networking infra.
- **[karpenter.yaml](karpenter.yaml)**: the `karpenter` group from [kubernetes-autoscaling-mixin](https://github.com/adinhodovic/kubernetes-autoscaling-mixin), verified against the pinned Karpenter chart version's metrics (`version_karpenter_helm` in the catalog repo). Labeled `component: k8s`, Karpenter is core node-provisioning infra.
- **[keda.yaml](keda.yaml)**: the mixin's `keda` group, fully commented out and applies no resource. KEDA isn't deployed here, kept as a ready reference if it's ever adopted.
