<!-- This doc is aggregated into the EKS Forge documentation site. It is not meant to be read directly in this repository. -->

# `nvidia-device-plugin` Helm Chart Reference

The [`nvidia-device-plugin` chart](./) deploys the [NVIDIA device plugin](https://github.com/NVIDIA/k8s-device-plugin) via the upstream `nvidia-device-plugin` chart. It advertises each GPU node's GPUs as the `nvidia.com/gpu` resource. [Values](#values) lists only what this chart sets. For every other key, read the upstream [`values.yaml`](https://github.com/NVIDIA/k8s-device-plugin/blob/main/deployments/helm/nvidia-device-plugin/values.yaml).

The upstream affinity matches NFD and GFD labels, which the cluster doesn't run. The plugin would never schedule without the affinity this chart sets.

The plugin has no network traffic. It talks to the kubelet over a Unix socket, so the cluster-wide `default-deny` covers it.

## What's Inside

- **[values.yaml](values.yaml)**: see [Values](#values)
- **[placeholder-values.yaml](placeholder-values.yaml)**: used only by `scripts/validate-helm.sh`, since the upstream chart refuses to render into the `default` namespace

## Values

### Scheduling

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| nvidia-device-plugin.affinity | object | see values.yaml | Pins the plugin to the `gpu` NodePool, with a matching `tolerations` entry. |

### Plugin

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| nvidia-device-plugin.resources | object | see values.yaml | Resource requests and limits. |
| nvidia-device-plugin.podSecurityContext | object | see values.yaml | Pod-level seccomp profile. |
| nvidia-device-plugin.securityContext | object | see values.yaml | Container security context, read-only root filesystem with every capability dropped. |

## Upstream Dependencies

- **[`units/features/gpu/node_pool`](https://github.com/ConsciousML/eks-forge-catalog/tree/main/units/features/gpu/node_pool)** (catalog): the `gpu` NodePool and its `karpenter.sh/workload-class=gpu` taint, which `affinity` and `tolerations` must match
