<!-- This doc is aggregated into the EKS Forge documentation site: https://eks-forge.readthedocs.io/latest/docs/reference/manifests/features/gpu/smoke-test/. It is not meant to be read directly in this repository. -->

# `gpu` Smoke Test Manifests Reference

The [`gpu` smoke test manifests](./) run the [NVIDIA device plugin](https://github.com/NVIDIA/k8s-device-plugin)'s `vectoradd` CUDA sample on a GPU node, on demand. A passing run proves a pod gets a GPU node and a working GPU.

## What's Inside

- **[gpu-smoke-test-cronjob.yaml](gpu-smoke-test-cronjob.yaml)**: suspended `CronJob`, triggers one run on demand. Its pod fits the spot and on-demand GPU NodePools, on instances with 4 vCPUs or less

The pod has no network traffic, so the cluster-wide `default-deny` covers it.

## Running the Test

```bash
kubectl create job --from=cronjob/gpu-smoke-test <name> -n gpu
kubectl wait --for=condition=complete job/<name> -n gpu --timeout=15m
kubectl logs job/<name> -n gpu
```

A passing run logs `Test PASSED`. The Job fails after 15 minutes without a result, and is deleted an hour after it finishes. Karpenter removes the GPU node once it's empty.

## Upstream Dependencies

- **[`gpu-namespaces`](../namespaces/)**: the `gpu` namespace
- **[`gpu-nvidia-device-plugin`](../../../../charts/features/gpu/nvidia-device-plugin/)**: advertises the `nvidia.com/gpu` resource the pod requests
- **[`units/features/gpu/node_pool`](https://github.com/ConsciousML/eks-forge-catalog/tree/main/units/features/gpu/node_pool)** (catalog): the `gpu-spot-node-pool` and `gpu-on-demand-node-pool` NodePools and their shared `karpenter.sh/workload-class=gpu` taint, which the pod's toleration must match
