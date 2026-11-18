<!-- This doc is aggregated into the EKS Forge documentation site: https://eks-forge.readthedocs.io/latest/docs/reference/manifests/network-policies/cluster-wide/. It is not meant to be read directly in this repository. -->

# `network-policies-cluster-wide` Manifests Reference

The [`network-policies-cluster-wide` manifests](./) define `CiliumClusterwideNetworkPolicy` rules, one file per concern. `default-deny.yaml` selects every pod in every namespace. Each other file selects the namespaces carrying its label, `network-policy.eks-forge.io/<file name>: "true"`, set in [`manifests/namespaces/`](../../namespaces/):

```yaml
endpointSelector:
  matchLabels:
    io.cilium.k8s.namespace.labels.network-policy.eks-forge.io/<file_name>: "true"
```

`argocd` and `kube-system` never carry these labels. They keep their own copies in [`network-policies/argocd/`](../argocd/) and [`charts/network-policies/kube-system/`](../../../charts/network-policies/kube-system/), to avoid a lockout if this Application fails to sync.

## What's Inside

- **[default-deny.yaml](default-deny.yaml)**: `enableDefaultDeny` for both directions, for every namespace
- **[kube-apiserver-egress.yaml](kube-apiserver-egress.yaml)**: egress to the API server, for namespaces that talk to it
- **[kube-dns-egress.yaml](kube-dns-egress.yaml)**: egress to `kube-dns`, for namespaces that resolve DNS
- **[eks-pod-identity-egress.yaml](eks-pod-identity-egress.yaml)**: egress to the EKS Pod Identity credential endpoint, for namespaces with pods using an EKS Pod Identity association

## Onboarding a Namespace

See [Write Network Policies](/docs/security/write-network-policies/).
