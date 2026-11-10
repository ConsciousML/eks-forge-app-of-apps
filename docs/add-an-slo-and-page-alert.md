{/* This doc is aggregated into the EKS Forge documentation site: https://eks-forge.readthedocs.io/latest/. It is not meant to be read directly in this repository. */}

# How to Add an SLO & Page Alert

This guide shows you how to add service level objectives (SLOs) to your app with a [Sloth](https://sloth.dev/) `PrometheusServiceLevel`, which gives each SLO a page alert and a ticket alert. You need it when you want to know that your app fails its users before they report it. It assumes your app's metrics are already in Prometheus (see [Monitor a New App](/docs/monitoring/monitor-a-new-app/)), and that you've created a branch in your app of apps fork, as in [Point Dev at Your Branch](/docs/applications/add-edit-or-remove-an-app/#point-dev-at-your-branch). It needs no change in your catalog fork.

For the concepts behind SLO alerts, see [How SLO Alerting Works](/docs/monitoring/paging/how-slo-alerting-works/). If you've never been paged, follow [Get Your First Page](/docs/monitoring/get-started/paging/) first.

## Turn Paging On in Dev

`dev` never pages by default. To test your page alert later, add [`PAGERDUTY_ENABLED`](/docs/reference/environment_variable/#pagerduty_enabled) to the `.env` file of your catalog fork:
```bash
export PAGERDUTY_ENABLED=true
```

Then re-apply the `argocd_app_of_apps` unit, as in [Sync Dev from Your Branch](/docs/applications/add-edit-or-remove-an-app/#sync-dev-from-your-branch). If you're pointing `dev` at your branch now, one apply does both.

## Write the SLOs

Add a `<name>-slo.yaml` file next to your app's files: in `manifests/<name>/` for plain manifests, or in `templates/` for a Helm chart. It holds one `PrometheusServiceLevel`, with one entry per SLO under `slos`:
```yaml
apiVersion: sloth.slok.dev/v1
kind: PrometheusServiceLevel
metadata:
  name: <name>
spec:
  service: <name>
  slos:
    - name: <slo>
      objective: <objective>
      description: "<description>"
      sli:
        events:
          errorQuery: <error-query>
          totalQuery: <total-query>
      alerting:
        ...
```

Replace:
- `<name>`: the name of your app.
- `<slo>`: the name of the SLO (e.g. `requests-availability`), unique within your app.
- `<objective>`: the share of events that must succeed over 30 days, in percent (e.g. `99`).
- `<description>`: what the SLO promises, in one sentence.
- `<error-query>`: a [PromQL](https://prometheus.io/docs/prometheus/latest/querying/basics/) query that returns the rate of bad events.
- `<total-query>`: a query that returns the rate of all events.

You fill in `alerting` in [Set the Alerts](#set-the-alerts).

Write the range of both queries as `[{{.window}}]`: Sloth replaces it with each window its alerts need. For how to write the queries, see [Querying Prometheus](https://prometheus.io/docs/prometheus/latest/querying/basics/), and [Histograms and Summaries](https://prometheus.io/docs/practices/histograms/) for a latency SLO. For what to measure, see [What to Measure Using SLIs](https://sre.google/workbook/implementing-slos/#what-to-measure-using-slis) in the SRE workbook.

For example, podinfo's availability SLO, in [`manifests/podinfo/podinfo-slo.yaml`](../manifests/podinfo/podinfo-slo.yaml), counts the requests that fail with a `5xx`:
```yaml
apiVersion: sloth.slok.dev/v1
kind: PrometheusServiceLevel
metadata:
  name: podinfo
spec:
  service: podinfo
  slos:
    - name: requests-availability
      objective: 99
      description: "99% of podinfo HTTP requests return a non-5xx status."
      sli:
        events:
          errorQuery: sum(rate(http_request_duration_seconds_count{namespace="podinfo", path!~"healthz|readyz|metrics", status=~"5.."}[{{.window}}]))
          totalQuery: sum(rate(http_request_duration_seconds_count{namespace="podinfo", path!~"healthz|readyz|metrics"}[{{.window}}]))
      ...
```

For more information, see the [`PrometheusServiceLevel` spec](https://github.com/slok/sloth/blob/main/pkg/kubernetes/api/sloth/v1/README.md).

## Set the Alerts

Under each SLO, add an `alerting` block. Set:
- `name`: the name of its alerts, shown in Prometheus and in the title of the Slack message (e.g. `PodinfoAvailabilityBudgetBurn`). The page and the ticket alerts share it.
- `labels.component`: `slo`, whatever app the SLO covers. Alertmanager already routes `slo` alerts to their own channels, so you need no new route (see [Routing by Component, Then Severity](/docs/monitoring/alerting/how-alerting-works/#routing-by-component-then-severity)).
- `pageAlert.labels.severity`: `critical`. The page alert posts to `#<environment>-slo-critical`, and also pages PagerDuty where paging is on (see [Paging Is Opt-In per Environment](/docs/monitoring/paging/how-paging-works/#paging-is-opt-in-per-environment)).
- `ticketAlert.labels.severity`: `warning`. The ticket alert only posts to `#<environment>-slo-warning`. Nothing opens a ticket: someone reviews the channel during working hours, and files one by hand if needed.
- `annotations`: a `summary` and a `description`, which make the body of the Slack message. The `summary` is also the title of the PagerDuty incident, often read alone on a lock screen, so name your app and what's failing (see [Incidents Open and Close Themselves](/docs/monitoring/paging/how-paging-works/#incidents-open-and-close-themselves)).

For example, the `alerting` block of podinfo's availability SLO:
```yaml
      alerting:
        name: PodinfoAvailabilityBudgetBurn
        labels:
          component: slo
        annotations:
          summary: "podinfo is burning its availability error budget"
          description: "podinfo 5xx ratio burns the 30d error budget of its 99% availability SLO too fast."
        pageAlert:
          labels:
            severity: critical
        ticketAlert:
          labels:
            severity: warning
```

For more information, see the [`PrometheusServiceLevel` spec](https://github.com/slok/sloth/blob/main/pkg/kubernetes/api/sloth/v1/README.md).

## Turn Paging On or Off for an SLO

Every SLO pages by default, through its page alert. To keep an SLO from paging (e.g. for an internal tool nobody needs at night), set `disable` under its `pageAlert`:
```yaml
        pageAlert:
          disable: true
```

Sloth then generates no page alert for it: the SLO never pages, and posts nothing to `#<environment>-slo-critical`. Only its ticket alert is left, in `#<environment>-slo-warning` (see [Pages and Tickets](/docs/monitoring/paging/how-slo-alerting-works/#pages-and-tickets)). The ticket alert watches longer windows, so a fast failure reaches Slack later than the page alert would have.

To turn paging back on, remove `disable`.

`disable` applies to one SLO, in every environment. Whether an environment pages at all is set by its EKS stack (see [Paging Is Opt-In per Environment](/docs/monitoring/paging/how-paging-works/#paging-is-opt-in-per-environment)). To choose who gets paged, see [Manage On-Call in PagerDuty](/docs/monitoring/paging/manage-on-call-in-pagerduty/).

## Deploy to Dev

Deploy your change to `dev` by following [Test in Dev](/docs/applications/add-edit-or-remove-an-app/#test-in-dev), up to the sync.

## Check the SLOs

Check that Sloth generated the rules of every SLO, replacing `<namespace>` with your app's namespace:
```bash
kubectl get prometheusservicelevels -n <namespace>
```

`DESIRED SLOs` and `READY SLOs` should show the same number, and `GEN OK` should show `true`. Sloth then wrote a `PrometheusRule` of the same name, next to your `PrometheusServiceLevel`:
```bash
kubectl get prometheusrules -n <namespace>
```

If `GEN OK` shows `false`, the Sloth controller's logs say why, most often a query that isn't valid PromQL:
```bash
kubectl logs -n monitoring -l app.kubernetes.io/name=sloth
```

If your `PrometheusServiceLevel` isn't listed, its Application didn't sync it. Run `argocd app get <app>`, replacing `<app>` with your app's Application, and fix the error it shows.

Then check that Prometheus loaded the alerts. Prometheus is only reachable over [Tailscale](/docs/networking/tailscale/). Connect by running `tailscale up`, then open `https://prometheus.private.dev.<base_domain>` in your browser, replacing `<base_domain>` with your base domain. In the top menu, click **Alerts**, and type the `name` of your `alerting` block in the search bar. You should see two rules, one with `severity: critical` and one with `severity: warning`, or only the `warning` one if you turned paging off. A new rule can take a minute to show up.

Check that your SLOs show in Grafana too. Open `https://grafana.private.dev.<base_domain>`, and log in as in [Log In to Grafana](/docs/monitoring/get-started/metrics/#log-in-to-grafana). In the left menu, click **Dashboards**, then open the **SLOs** folder:
- **High level Sloth SLOs** should list your SLOs, under the `service` you set.
- **SLO / Detail** shows one SLO at a time. Pick your `service` and SLO at the top, and check its panels show data.

Both read Sloth's recording rules, so they only show data once your app has served requests.

## Check the Page

To see your page alert reach Slack and PagerDuty, make your app fail the way your SLO counts as bad, fast enough to burn its error budget: requests that fail for an availability SLO, or that are slow for a latency SLO. For example, [Make Podinfo Fail](/docs/monitoring/get-started/paging/#make-podinfo-fail) sends podinfo requests to `/status/500` for two minutes.

Within a few minutes, your page alert should fire in Prometheus, post to `#dev-slo-critical`, and page you, as in [Watch the Alert Fire](/docs/monitoring/get-started/paging/#watch-the-alert-fire) and [Get Paged](/docs/monitoring/get-started/paging/#get-paged). If it never fires, run your `errorQuery` in Prometheus with a fixed range like `[5m]`, and check that it returns the failures you send.

Then stop the failure, and turn paging off in `dev`: remove the `PAGERDUTY_ENABLED` line from your `.env` file, run `unset PAGERDUTY_ENABLED`, and re-apply the `argocd_app_of_apps` unit again. If the incident is still open in PagerDuty, resolve it by hand, as in [Turn Paging Off](/docs/monitoring/get-started/paging/#turn-paging-off).

## Open a Pull Request and Merge

Follow [Open a Pull Request](/docs/applications/add-edit-or-remove-an-app/#open-a-pull-request) and [Merge](/docs/applications/add-edit-or-remove-an-app/#merge).

To ship your SLOs to `staging` and `prod`, see [Release a Change to Production](/docs/deployment/release-a-change-to-production/). Paging is on in `prod`, so its page alerts page the person on call from then on.
