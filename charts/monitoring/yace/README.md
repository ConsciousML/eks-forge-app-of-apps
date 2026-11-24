<!-- This doc is aggregated into the EKS Forge documentation site: https://eks-forge.readthedocs.io/latest/docs/reference/helm_charts/monitoring/yace/. It is not meant to be read directly in this repository. -->

# `yace` Helm Chart Reference

The [`yace` chart](./) deploys [YACE](https://github.com/prometheus-community/yet-another-cloudwatch-exporter) via the upstream `yet-another-cloudwatch-exporter` chart. It exports the CloudWatch metrics of every ALB tagged `eks-forge.io/slo-service` to Prometheus, for the SLIs measured at the load balancer. [Values](#values) lists only what this chart sets. For every other key, read the upstream [`values.yaml`](https://github.com/prometheus-community/helm-charts/blob/main/charts/prometheus-yet-another-cloudwatch-exporter/values.yaml).

## What's Inside

- **[templates/network-policy.yaml](templates/network-policy.yaml)**: the exporter's `CiliumNetworkPolicy`
- **[values.yaml](values.yaml)**: see [Values](#values)
- **[values.schema.json](values.schema.json)**: rejects the values the catalog injects via `appParams` when empty, so a missing injection fails the render
- **[placeholder-values.yaml](placeholder-values.yaml)**: used only by `scripts/validate-helm.sh`, so standalone `helm template` and kubeconform pass

## Exported Metrics

One gauge per ALB and statistic, one sample per 60s CloudWatch period, stamped with the CloudWatch timestamp. Sum them with `sum_over_time`, never `rate`. Every series carries `dimension_LoadBalancer` and `tag_eks_forge_io_slo_service`.

| Metric | CloudWatch Metric and Statistic |
|--------|---------------------------------|
| `aws_applicationelb_target_response_time_sample_count` | `TargetResponseTime` `SampleCount` |
| `aws_applicationelb_target_response_time_tc__0_1_` | `TargetResponseTime` `TC(:0.1)`, samples of 100ms or less |
| `aws_applicationelb_request_count_sum` | `RequestCount` `Sum` |
| `aws_applicationelb_httpcode_target_5_xx_count_sum` | `HTTPCode_Target_5XX_Count` `Sum` |
| `aws_applicationelb_httpcode_elb_5_xx_count_sum` | `HTTPCode_ELB_5XX_Count` `Sum` |
| `aws_applicationelb_httpcode_elb_503_count_sum` | `HTTPCode_ELB_503_Count` `Sum`, not counted in `RequestCount` |

CloudWatch publishes the 5XX metrics only once they're nonzero, and YACE discovers a new metric once `ListMetrics` lists it, up to 15 minutes later. Wrap each error term in `or vector(0)`. Data lags 3 to 5 minutes (CloudWatch publishing, the 120s `delay`, and one 60s YACE poll).

## Values

### Network

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| vpcEndpointCidrs | object | see values.yaml | Interface endpoint IPs of the CloudWatch (`monitoring`) and Resource Groups Tagging (`tagging`) APIs. Injected by the catalog via `appParams`. |

### Discovery

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| yet-another-cloudwatch-exporter.region | string | `""` | AWS region of the ALBs. Injected by the catalog via `appParams`. |
| yet-another-cloudwatch-exporter.clusterName | string | `""` | EKS cluster name, matched against the `elbv2.k8s.aws/cluster` tag the AWS Load Balancer Controller sets on its ALBs. Injected by the catalog via `appParams`. |
| yet-another-cloudwatch-exporter.config | string | see values.yaml | YACE config, rendered with `tpl`. One `AWS/ApplicationELB` discovery job over the ALBs tagged `eks-forge.io/slo-service`, exporting the per-minute counts the SLIs sum with `sum_over_time`. |

### Exporter

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| yet-another-cloudwatch-exporter.image | object | see values.yaml | YACE image, pinned. |
| yet-another-cloudwatch-exporter.fullnameOverride | string | `"yace"` | Release-independent names. The ServiceAccount must match the catalog's Pod Identity association. |
| yet-another-cloudwatch-exporter.testConnection | bool | `false` | Upstream `helm test` Pod, off. Its egress isn't allowed by the network policy. |
| yet-another-cloudwatch-exporter.extraArgs | object | see values.yaml | Seconds between two CloudWatch scrapes, and the `account_alias` lookup turned off. |
| yet-another-cloudwatch-exporter.resources | object | see values.yaml | Resource requests and limits. |
| yet-another-cloudwatch-exporter.podSecurityContext | object | see values.yaml | Pod-level non-root user, UID and GID 65534. |
| yet-another-cloudwatch-exporter.securityContext | object | see values.yaml | Container-level read-only root filesystem, no privilege escalation, and no capabilities. |
| yet-another-cloudwatch-exporter.nodeSelector | object | see values.yaml | Pins the exporter to the `critical` NodePool, with a matching `tolerations` entry. |
| yet-another-cloudwatch-exporter.serviceMonitor | object | see values.yaml | Prometheus `ServiceMonitor`, scraping every 60s. |

## Upstream Dependencies

- **[`app_of_apps`](https://github.com/ConsciousML/eks-forge-catalog/blob/main/units/eks/addons/argocd/app_of_apps/terragrunt.hcl)** (catalog): injects `region`, `clusterName`, and `vpcEndpointCidrs`
- **[`yace` IAM role](https://github.com/ConsciousML/eks-forge-catalog/blob/main/units/eks/addons/yace/iam_role/terragrunt.hcl)** (catalog): the Pod Identity association of the `yace` ServiceAccount
- **[`gateway`](../../gateway-api/gateway)**: sets the `eks-forge.io/slo-service` tag on the ALB
- **[`kube-prometheus-stack`](../kube-prometheus-stack)**: `outOfOrderTimeWindow` accepts the past CloudWatch points `exportAllDataPoints` re-exports
