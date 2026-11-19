<!-- This doc is aggregated into the EKS Forge documentation site: https://eks-forge.readthedocs.io/latest/docs/reference/manifests/features/example/namespaces/. It is not meant to be read directly in this repository. -->

# `example` Namespaces Manifests Reference

The [`example` namespaces manifests](./) define the namespaces of the `example` optional feature, with the same labels as core's [`namespaces`](../../../namespaces/).

## What's Inside

- **[example.yaml](example.yaml)**: the `example` namespace. It enforces `baseline`, warns and audits at `restricted`, and opts into the `kube-dns-egress` and `eks-pod-identity-egress` [cluster-wide network policies](../../../network-policies/cluster-wide/)

## Upstream Dependencies

- **[`network-policies-cluster-wide`](../../../network-policies/cluster-wide/)** (core): `default-deny` selects every namespace, including this one
