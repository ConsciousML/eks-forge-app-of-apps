<!-- This doc is aggregated into the EKS Forge documentation site: https://eks-forge.readthedocs.io/latest/docs/reference/helm_charts/features/example/s3-lister/. It is not meant to be read directly in this repository. -->

# `s3-lister` Helm Chart Reference

The [`s3-lister` chart](./) runs the pod of the `example` optional feature. It lists the feature's S3 bucket every `intervalSeconds`, with credentials from the Pod Identity association the catalog creates for its `ServiceAccount`.

## What's Inside

- **[templates/serviceaccount.yaml](templates/serviceaccount.yaml)**: the `s3-lister` `ServiceAccount`. Its name must match `service_account` in the catalog's `units/features/example/iam_role`
- **[templates/deployment.yaml](templates/deployment.yaml)**: one replica looping `aws s3 ls`. Each listing is in the pod logs
- **[templates/network-policy.yaml](templates/network-policy.yaml)**: allows only the pod's S3 egress on port `443`. DNS and Pod Identity agent egress come from the namespace's cluster-wide policies
- **[values.yaml](values.yaml)**: see [Values](#values)
- **[values.schema.json](values.schema.json)**: rejects an empty `bucket` or `region`, so a missing injection fails the render
- **[placeholder-values.yaml](placeholder-values.yaml)**: used only by `scripts/validate-helm.sh`, so standalone `helm template` and kubeconform pass

## Values

### Catalog Inputs

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| bucket | string | `""` | Name of the bucket the pod lists. Injected by the catalog via `appParams`. |
| region | string | `""` | AWS region of the bucket. Injected by the catalog via `appParams`. |

### Workload

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| image | string | `"amazon/aws-cli:2.39.3"` | Container image of the pod. |
| intervalSeconds | int | `60` | Seconds between two listings. |

## Upstream Dependencies

- **[`example-namespaces`](../../../../manifests/features/example/namespaces/)**: the `example` namespace
- **[`units/features/example`](https://github.com/ConsciousML/eks-forge-catalog/tree/main/units/features/example)** (catalog): the bucket, the Pod Identity role scoped to `s3:ListBucket` on it, and the `appParams` carrying `bucket` and `region`
