import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import type { State } from "../../../core/state/state.js";
import type { CliCommand } from "../cli-command.types.js";
import { t } from "../../../core/i18n.js";

export function appLsCommand(): CliCommand {
  return {
    register: (state: State) => {
      return new Command("ls")
        .summary(t("cli:commands.app.ls.summary"))
        .description(t("cli:commands.app.ls.description"))
        .action(async (_options, _command) => {
          const apps = await state.appService.list();

          if (apps.length === 0) {
            console.log(t("cli:commands.app.ls.noApps"));
            return;
          }

          console.log(
            chalk.bold(
              `${chalk.cyan(t("cli:commands.app.ls.idHeader")).padEnd(8)}${chalk.green(t("cli:commands.app.ls.nameHeader")).padEnd(30)}${chalk.magenta(t("cli:commands.app.ls.statusHeader"))}`,
            ),
          );
          console.log(
            chalk.dim("\u2500".repeat(60)),
          );

          for (const app of apps) {
            console.log(
              `${chalk.cyan(app.id).padEnd(8)}${chalk.green(app.name).padEnd(30)}${chalk.magenta(app.status)}`,
            );
          }
        })
        .addHelpText(
          "after",
          `
Examples:
  $ shep app ls
  List all applications with their status.

  $ shep app list
  Alias for ls.
`,
        );
    },
  };
}