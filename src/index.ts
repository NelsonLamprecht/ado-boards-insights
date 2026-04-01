import * as SDK from "azure-devops-extension-sdk";
import { getClient } from "azure-devops-extension-api";
import { WorkRestClient } from "azure-devops-extension-api/Work";
import { WorkItemTrackingRestClient } from "azure-devops-extension-api/WorkItemTracking";

// Module-level state so the selection handler can re-render without re-fetching.
let storyPointsById = new Map<number, number>();
let selectedIds: number[] = [];
let scopeLabel = "";

const logPrefix = "[BoardsInsights]";

SDK.init({ loaded: false, applyTheme: true });
console.log(`${logPrefix} SDK.init called`, {
  contributionId: SDK.getContributionId(),
  webContext: SDK.getWebContext(),
});

// The backlog hub calls onSelectionChanged on the registered contribution object
// whenever the user selects or deselects rows in the grid.
SDK.register(SDK.getContributionId(), {
  onSelectionChanged: (data: any) => {
    console.log(`${logPrefix} onSelectionChanged`, data);
    // ADO may pass { workItemIds: number[] } or an array directly.
    if (Array.isArray(data)) {
      selectedIds = data.map((x: any) => (typeof x === "number" ? x : x.id));
    } else {
      selectedIds = data?.workItemIds ?? data?.selectedWorkItems?.map((w: any) => w.id) ?? [];
    }
    renderSummary();
  },
});

SDK.ready().then(async () => {
  console.log(`${logPrefix} SDK.ready resolved`);
  // Notify load succeeded immediately so ADO shows the pane without waiting for data.
  SDK.notifyLoadSucceeded();
  console.log(`${logPrefix} notifyLoadSucceeded called`);
  const statusEl = document.getElementById("status");

  try {
    const projectService = await SDK.getService<any>(
      "ms.vss-tfs-web.tfs-page-data-service"
    );
    const pageData = projectService.getPageData
      ? projectService.getPageData()
      : null;
    const project: string = pageData?.project?.name ?? SDK.getHost().name;
    const teamContext = {
      project,
      projectId: pageData?.project?.id,
      team: pageData?.team?.name,
      teamId: pageData?.team?.id,
    };

    scopeLabel = `${project}${teamContext.team ? ` / ${teamContext.team}` : ""}`;
    console.log(`${logPrefix} Resolved team context`, teamContext);

    if (statusEl) {
      statusEl.innerText = `Loading backlog story points for ${scopeLabel}…`;
    }

    const workClient = getClient(WorkRestClient);
    const witClient = getClient(WorkItemTrackingRestClient);

    // Build an area-path clause that matches what ADO shows for this team.
    const teamFieldValues = await workClient.getTeamFieldValues(teamContext);
    const areaValues = teamFieldValues?.values ?? [];

    let areaClause: string;
    if (areaValues.length === 0) {
      areaClause = `[System.AreaPath] UNDER '${project.replace(/'/g, "''")}'`;
    } else {
      const parts = areaValues.map((v) => {
        const escaped = v.value.replace(/'/g, "''");
        return v.includeChildren
          ? `[System.AreaPath] UNDER '${escaped}'`
          : `[System.AreaPath] = '${escaped}'`;
      });
      areaClause = parts.length === 1 ? parts[0] : `(${parts.join(" OR ")})`;
    }

    const wiql = {
      query:
        "SELECT [System.Id] FROM WorkItems " +
        "WHERE [System.TeamProject] = @project " +
        "AND [System.WorkItemType] IN ('User Story','Product Backlog Item','Bug') " +
        `AND [System.State] <> 'Removed' AND ${areaClause} ` +
        "ORDER BY [Microsoft.VSTS.Common.StackRank]",
    };

    const wiqlResult = await witClient.queryByWiql(wiql, project);
    const ids = wiqlResult?.workItems?.map((w) => w.id) ?? [];
    console.log(`${logPrefix} WIQL result`, { count: ids.length });

    if (ids.length === 0) {
      if (statusEl) statusEl.innerText = "No backlog items found.";
      console.log(`${logPrefix} No backlog items found`);
      renderSummary();
      return;
    }

    storyPointsById = new Map();
    const chunkSize = 200;

    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const items = await witClient.getWorkItems(chunk, project, [
        "Microsoft.VSTS.Scheduling.StoryPoints",
      ]);
      for (const wi of items) {
        const val = Number(wi.fields?.["Microsoft.VSTS.Scheduling.StoryPoints"]);
        storyPointsById.set(wi.id, isNaN(val) ? 0 : val);
      }
    }

    if (statusEl) statusEl.innerText = `Loaded ${ids.length} backlog items.`;
    console.log(`${logPrefix} Extension load succeeded`);
    renderSummary();
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    if (statusEl) statusEl.innerText = `Extension error: ${msg}`;
    const totalEl = document.getElementById("total");
    if (totalEl) totalEl.innerText = "-";
    SDK.notifyLoadFailed(msg);
    console.error(`${logPrefix} Extension load failed`, err);
  }
}).catch((err) => {
  SDK.notifyLoadFailed(String(err));
  console.error(`${logPrefix} SDK.ready failed`, err);
  const statusEl = document.getElementById("status");
  if (statusEl) statusEl.innerText = `Initialization error: ${err}`;
});

function renderSummary(): void {
  const isSelection = selectedIds.length > 0;
  const ids = isSelection ? selectedIds : Array.from(storyPointsById.keys());

  let total = 0;
  for (const id of ids) {
    total += storyPointsById.get(id) ?? 0;
  }

  const totalEl = document.getElementById("total");
  const modeLabelEl = document.getElementById("mode-label");
  const countEl = document.getElementById("item-count");
  const scopeEl = document.getElementById("scope");

  if (totalEl) totalEl.innerText = `${total}`;
  if (modeLabelEl) {
    modeLabelEl.innerText = isSelection ? "Selected" : "Total";
    modeLabelEl.className = isSelection ? "label label--selected" : "label";
  }
  if (countEl) {
    countEl.innerText = `${ids.length} ${isSelection ? "selected" : "backlog"} item${ids.length !== 1 ? "s" : ""}`;
  }
  if (scopeEl) scopeEl.innerText = `Scope: ${scopeLabel}`;
  console.log(`${logPrefix} renderSummary`, {
    mode: isSelection ? "selection" : "total",
    idCount: ids.length,
    total,
  });
}