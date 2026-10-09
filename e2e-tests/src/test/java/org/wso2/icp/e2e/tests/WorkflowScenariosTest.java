package org.wso2.icp.e2e.tests;

import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.assertions.LocatorAssertions;
import com.microsoft.playwright.options.AriaRole;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.wso2.icp.e2e.BaseCoreE2ETest;
import org.wso2.icp.e2e.E2EEnvironment;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;

@Tag("e2e")
@Tag("workflow")
@DisplayName("Workflow scenarios")
class WorkflowScenariosTest extends BaseCoreE2ETest {
    // Seeded by the test data; runtimes connect to it with an org-level secret.
    private static final String ENVIRONMENT = "dev";
    // Workflow reads travel to the runtime over its heartbeat, so the console answers within seconds, not instantly.
    private static final double RUNTIME_TIMEOUT_MS = 90_000;

    private String integrationPath;

    @AfterEach
    void releaseRuntimes() {
        E2EEnvironment.stopRuntimes();
    }

    @Test
    @DisplayName("A workflow integration that registers itself is managed from the console")
    void selfRegisteredWorkflowIntegrationIsManagedFromConsole() throws Exception {
        String suffix = Long.toString(System.currentTimeMillis(), 36);
        String project = "e2e-wf-project-" + suffix;
        String integration = "e2e-wf-" + suffix;
        String orderId = "ORD-" + suffix;
        String workflowId = "e2e-order-" + suffix;
        integrationPath = "/organizations/default/projects/" + project + "/components/" + integration;

        signInAsAdmin();
        String secret = generateOrgSecret();
        // Neither the project nor the integration exists yet: the runtime's first heartbeat creates both.
        E2EEnvironment.startWorkflowRuntime(UUID.randomUUID().toString(), ENVIRONMENT, project, integration, secret);

        assertListedAsWorkflowIntegration(project, integration);
        assertWorkflowFeaturesOffered();
        startWorkflow(orderId, workflowId);
        assertExecutionStatus(workflowId, "Running");
        approve(orderId);
        assertExecutionStatus(workflowId, "Completed");
        assertResult(workflowId, "APPROVED");
    }

    private String generateOrgSecret() {
        open("/organizations/default/runtimes");
        page.locator("xpath=//h2[normalize-space()='" + ENVIRONMENT + "']/ancestor::*[contains(@class,'MuiCardContent-root')][1]")
                .getByRole(AriaRole.BUTTON, new Locator.GetByRoleOptions().setName("Add Runtime"))
                .click();
        page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Generate Secret")).click();
        Matcher matcher = Pattern.compile("secret\\s*=\\s*\"([^\"]+)\"").matcher(page.locator("pre").first().textContent());
        if (!matcher.find()) throw new IllegalStateException("Secret not found in the generated runtime config");
        page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Close").setExact(true)).click();
        return matcher.group(1);
    }

    // The project page does not poll, so reload until the registration shows up typed.
    private void assertListedAsWorkflowIntegration(String project, String integration) {
        open("/organizations/default/projects/" + project);
        Locator row = page.getByRole(AriaRole.ROW, new Page.GetByRoleOptions().setName("View details for " + integration));
        Locator workflowType = row.getByRole(AriaRole.CELL, new Locator.GetByRoleOptions().setName("Workflow").setExact(true));
        Instant deadline = Instant.now().plus(Duration.ofSeconds(60));
        while (!workflowType.isVisible() && Instant.now().isBefore(deadline)) {
            page.waitForTimeout(2_000);
            page.reload();
        }
        assertThat(workflowType).isVisible();
        row.click();
    }

    private void assertWorkflowFeaturesOffered() {
        Locator nav = page.getByRole(AriaRole.NAVIGATION);
        assertThat(nav.getByRole(AriaRole.BUTTON, new Locator.GetByRoleOptions().setName("Workflows").setExact(true))).isVisible();
        assertThat(nav.getByRole(AriaRole.BUTTON, new Locator.GetByRoleOptions().setName("Human Tasks").setExact(true))).isVisible();
        assertThat(page.getByRole(AriaRole.COMBOBOX, new Page.GetByRoleOptions().setName("Workflow Definitions")))
                .hasText("orderApproval", new LocatorAssertions.HasTextOptions().setTimeout(RUNTIME_TIMEOUT_MS));
    }

    private void startWorkflow(String orderId, String workflowId) {
        page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Start New Workflow")).click();
        Locator dialog = page.getByRole(AriaRole.DIALOG);
        dialog.getByRole(AriaRole.COMBOBOX, new Locator.GetByRoleOptions().setName("Workflow Name")).click();
        page.getByRole(AriaRole.OPTION, new Page.GetByRoleOptions().setName("orderApproval").setExact(true)).click();
        dialog.getByRole(AriaRole.TEXTBOX, new Locator.GetByRoleOptions().setName("Id").setExact(true)).fill(orderId);
        dialog.getByRole(AriaRole.BUTTON, new Locator.GetByRoleOptions().setName("Advanced")).click();
        dialog.getByRole(AriaRole.TEXTBOX, new Locator.GetByRoleOptions().setName("Workflow ID").setExact(true)).fill(workflowId);
        dialog.getByRole(AriaRole.BUTTON, new Locator.GetByRoleOptions().setName("Start").setExact(true)).click();
        assertThat(dialog.getByRole(AriaRole.HEADING, new Locator.GetByRoleOptions().setName("Workflow Started")))
                .isVisible(new LocatorAssertions.IsVisibleOptions().setTimeout(RUNTIME_TIMEOUT_MS));
        assertThat(dialog.locator("code")).hasText(workflowId);
        dialog.getByRole(AriaRole.BUTTON, new Locator.GetByRoleOptions().setName("Close").setExact(true)).click();
    }

    // The list refreshes itself; the timeout outlasts its auto-refresh interval.
    private void assertExecutionStatus(String workflowId, String status) {
        open(integrationPath + "/workflows");
        page.getByRole(AriaRole.TEXTBOX, new Page.GetByRoleOptions().setName("Search by workflow ID")).fill(workflowId);
        assertThat(executionRow(workflowId).getByRole(AriaRole.CELL, new Locator.GetByRoleOptions().setName(status).setExact(true)))
                .isVisible(new LocatorAssertions.IsVisibleOptions().setTimeout(RUNTIME_TIMEOUT_MS));
    }

    private void approve(String orderId) {
        open(integrationPath + "/workflow-tasks");
        Locator task = page.getByText("Approve order " + orderId, new Page.GetByTextOptions().setExact(true));
        task.click(new Locator.ClickOptions().setTimeout(RUNTIME_TIMEOUT_MS));
        page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Complete Task")).first().click();
        page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Yes").setExact(true)).click();
        page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Review before completion")).click();
        page.getByRole(AriaRole.DIALOG).getByRole(AriaRole.BUTTON, new Locator.GetByRoleOptions().setName("Complete Task")).click();
        assertThat(page.getByText("Task completed.")).isVisible(new LocatorAssertions.IsVisibleOptions().setTimeout(RUNTIME_TIMEOUT_MS));
    }

    private void assertResult(String workflowId, String result) {
        executionRow(workflowId).getByRole(AriaRole.CELL, new Locator.GetByRoleOptions().setName("orderApproval")).click();
        assertThat(page.getByRole(AriaRole.HEADING, new Page.GetByRoleOptions().setName("Workflow Result")))
                .isVisible(new LocatorAssertions.IsVisibleOptions().setTimeout(RUNTIME_TIMEOUT_MS));
        assertThat(page.getByText(result, new Page.GetByTextOptions().setExact(true)).first()).isVisible();
    }

    // Long IDs are shown truncated; the full one is the cell's title.
    private Locator executionRow(String workflowId) {
        return page.locator("tr").filter(new Locator.FilterOptions()
                .setHas(page.getByTitle(workflowId, new Page.GetByTitleOptions().setExact(true))));
    }
}
