# Shep — Parallel AI Agent Demo
#
# Records a ~60 second terminal demo showing Shep launching
# multiple features in parallel across git worktrees.
#
# Usage:
#   vhs demo/shep-parallel.tape
#
# Output: demo/shep-parallel.gif
#
# Prerequisites:
#   - Shep installed globally (npm i -g @shepai/cli)
#   - A git repo with an authenticated AI agent
#   - VHS installed (brew install vhs)
#
# To re-record after UI changes, edit this file and re-run.

# --- Output settings ---
Output demo/shep-parallel.gif
Set FontSize 16
Set Width 900
Set Height 500
Set Padding 20
Set FontFamily "JetBrains Mono, SF Mono, Menlo, monospace"
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms
Set PlaybackSpeed 1

# --- Scene 1: Introduction ---
# Show we're in a real project directory

Sleep 500ms

Type "# Ship features 10x faster with parallel AI agents"
Enter
Sleep 1s

Type "cd ~/projects/my-app && ls"
Enter
Sleep 1.5s

# --- Scene 2: Launch first feature ---

Type "shep feat new 'add /health endpoint with uptime and version' --push --pr"
Enter
Sleep 3s

# --- Scene 3: Launch more features in rapid succession ---

Type "shep feat new 'add rate limiting middleware' --push --pr"
Enter
Sleep 2s

Type "shep feat new 'add structured JSON logging' --push --pr"
Enter
Sleep 2s

Type "shep feat new 'add dark mode toggle' --push --pr"
Enter
Sleep 2s

Type "shep feat new 'fix login redirect bug' --push --pr"
Enter
Sleep 2s

# --- Scene 4: Show all features running ---

Type "# Five features launched. Each in its own worktree."
Enter
Sleep 1.5s

Type "shep feat ls"
Enter
Sleep 4s

# --- Scene 5: Show the dashboard ---

Type "# Monitor everything from the web dashboard at localhost:4050"
Enter
Sleep 1.5s

Type "shep status"
Enter
Sleep 3s

# --- Scene 6: Features complete ---

Type "# Each agent works independently — zero branch conflicts."
Enter
Type "# When done: auto-commit, auto-push, auto-PR."
Enter
Sleep 2s

Type "# One command. Five features. Parallel."
Enter
Sleep 3s

# --- End ---
Sleep 2s
