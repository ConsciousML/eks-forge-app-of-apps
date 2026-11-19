<!-- This doc is aggregated into the EKS Forge documentation site. It is not meant to be read directly in this repository. -->

# `example` Root Chart Reference

The [`example` root chart](./) lists the applications of the `example` optional feature. It renders one ArgoCD `Application` per entry under `applications`, through the [`app-of-apps` library chart](../../../charts/app-of-apps/). The feature proves the optional feature mechanism end to end: a pod lists an S3 bucket through Pod Identity.

## What's Inside

- **[templates/applications.yaml](templates/applications.yaml)**: includes the library's `app-of-apps.applications` template
- **[values.yaml](values.yaml)**: every application entry, with its dependency chain in comments, see [Values](#values). Entry fields are in the library's [Values Schema](../../../charts/app-of-apps/#values-schema)
- **[values.schema.json](values.schema.json)**: rejects an empty `config.spec.source.repoURL` or `global.environment`, and any `appParams` key it doesn't list
- **[placeholder-values.yaml](placeholder-values.yaml)**: used only by `scripts/validate-helm.sh`, so standalone `helm template` and kubeconform pass
- **[`example-namespaces`](../../../manifests/features/example/namespaces/)**: the feature's `example` namespace. Removing the feature deletes it
- **[`example-s3-lister`](../../../charts/features/example/s3-lister/)**: the pod listing the bucket

## Values

### Source

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| config.spec.destination.server | string | `"https://kubernetes.default.svc"` | Cluster every child `Application` deploys to. |
| config.spec.source.repoURL | string | `""` | This repository's URL, for every child `Application`. Set by the catalog from `github.hcl`. Must not be empty. |
| config.spec.source.targetRevision | string | `"main"` | Git revision every child `Application` syncs. Set by the catalog. |

### Catalog Inputs

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| appParams | object | `{}` | Values injected per application, keyed by `name`, as the child `Application`'s `spec.source.helm.values`. Set by the catalog's `app_of_apps` unit. |
| global.environment | string | `""` | Deploying environment (`dev`, `staging`, or `prod`), rendered into `extraValueFiles` entries to pick a `values-<env>.yaml` overlay. Set by the catalog. Must not be empty. |

### Applications

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| applications | list | see values.yaml | One child `Application` per entry. See [Values Schema](#values-schema). |

## Upstream Dependencies

- **[`app-of-apps`](../../../charts/app-of-apps/)**: the template this chart renders
- **[`core`](../../core/)**: the cluster-wide network policies the `example` namespace opts into
- **[`units/features/example/app_of_apps`](https://github.com/ConsciousML/eks-forge-catalog/tree/main/units/features/example/app_of_apps)** (catalog): provisions the root `Application` that points at this chart and sets `appParams`
