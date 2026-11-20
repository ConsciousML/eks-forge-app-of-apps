<!-- This doc is aggregated into the EKS Forge documentation site: https://eks-forge.readthedocs.io/latest/docs/reference/manifests/features/gpu/namespaces/. It is not meant to be read directly in this repository. -->

# `gpu` Namespaces Manifests Reference

The [`gpu` namespaces manifests](./) define the namespaces of the `gpu` optional feature, with the same labels as core's [`namespaces`](../../../namespaces/).

## What's Inside

- **[gpu.yaml](gpu.yaml)**: the `gpu` namespace. It enforces `privileged`, since the NVIDIA device plugin and DCGM exporter mount kubelet host paths

## Upstream Dependencies

- **[`network-policies-cluster-wide`](../../../network-policies/cluster-wide/)** (core): `default-deny` selects every namespace, including this one
