{/* This doc is aggregated into the EKS Forge documentation site: https://eks-forge.readthedocs.io/latest/. It is not meant to be read directly in this repository. */}

# How to Release an App Change

This guide shows you how to ship the changes merged in your [app of apps fork](/docs/applications/get-started/app-of-apps-setup/#fork-the-app-of-apps-repository) to [`staging`](/docs/iac/#staging) and [`prod`](/docs/iac/#prod). It's one of the steps of [Release a Change to Production](/docs/deployment/release-a-change-to-production/), and assumes you've created a branch in your live fork, as in [Create a Live Branch](/docs/deployment/release-a-change-to-production/#create-a-live-branch).

## Point Live at Your App of Apps Fork

From the root of your live fork, ensure these values in [`live/github.hcl`](https://github.com/ConsciousML/eks-forge-live/blob/main/live/github.hcl) point at your app of apps fork:
```hcl
locals {
  github_owner_app_of_apps     = "<your-github-username-or-org-name-where-your-app-of-apps-fork-is>"
  github_repo_name_app_of_apps = "<your-app-of-apps-repo-name>"
  app_of_apps_private          = <true-if-your-fork-is-private>
  ...
}
```

Otherwise, `staging` and `prod` keep syncing the original app of apps repository. Set `app_of_apps_private` to `true` if your fork is private, `false` if it's public.

## Tag the App of Apps Fork

From the root of your app of apps fork, pull `main` and print your fork's latest tag:
```bash
git checkout main
git pull origin main
git fetch --tags
git tag --sort=-v:refname | head -1
```

List the commits merged since that tag, replacing `<old-tag>` with it:
```bash
git log --oneline <old-tag>..main
```

Pick the next version from those commits, following [semantic versioning](https://semver.org/):
- **Minor** (e.g. `v0.5.0` after `v0.4.0`): at least one `feat:` commit.
- **Patch** (e.g. `v0.4.1` after `v0.4.0`): no `feat:` commit.

Tag `main` with it and push the tag, replacing `<tag>` with the new version:
```bash
git tag <tag>
git push origin <tag>
```

## Pin the Tag in Live

From the root of your live fork, set `app_of_apps_target_revision` to your tag in both [`live/staging/eks/stack/terragrunt.stack.hcl`](https://github.com/ConsciousML/eks-forge-live/blob/main/live/staging/eks/stack/terragrunt.stack.hcl) and [`live/prod/eks/stack/terragrunt.stack.hcl`](https://github.com/ConsciousML/eks-forge-live/blob/main/live/prod/eks/stack/terragrunt.stack.hcl). Set the same tag in both, since CI only tests `staging`:
```hcl
locals {
  ...
  app_of_apps_target_revision = "<tag>"
  ...
}
```

Then return to [Update the Live Fork](/docs/deployment/release-a-change-to-production/#update-the-live-fork).

## Delete a Removed App's Namespace

If your change removed an app and deleted its namespace file, ArgoCD leaves the namespace in the cluster, since it never deletes one (see [Deletion Safety](/docs/applications/how-the-app-of-apps-works/#deletion-safety)).

Once your release reaches `prod`, connect `kubectl` to it as in [Check Prod](/docs/deployment/release-a-change-to-production/#check-prod), then delete the namespace, replacing `<namespace>`. This also deletes what's left inside it, such as the volumes of a `StatefulSet`:
```bash
kubectl delete namespace <namespace>
```

`staging` needs nothing, since each test run destroys it.
