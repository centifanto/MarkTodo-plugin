# Contributing to MarkTodo

Thanks for helping. Bug reports, ideas and pull requests are all welcome.

## Before you start

- **Bugs and ideas:** open an issue. For a bug, include your Obsidian version, your
  platform, and the todo lines involved (copy them from the note in Source mode).
- **Larger changes:** open an issue first and describe what you want to change, so
  we can agree on the approach before you spend time on it.
- **The Markdown format** (`src/core/`) is shared with the MarkTodo companion app, so
  a change to how todo lines are read or written needs discussion first.

## Making a change

Setup and architecture are in the [README](README.md#development). Before you open a
pull request, run:

```bash
pnpm check          # TypeScript
pnpm check:svelte   # Svelte components
pnpm test           # unit tests
pnpm lint           # Obsidian's review rules
```

Add or update tests for what you change, and match the style of the code around it.

## License of your contributions

MarkTodo is licensed under the [GNU General Public License, version 3 or later](LICENSE).
Isaiah Centifanto (the "Maintainer") also uses parts of this code, notably
`src/core/`, in the MarkTodo companion app, which is distributed under different
terms. So that every contribution can be used in both, contributions are accepted
under the Contributor License Agreement below.

**By submitting a contribution to this repository, you agree to these terms:**

1. **Contribution.** "Contribution" means any code, documentation or other material
   you submit to this repository, for example in a pull request or a patch.

2. **You keep your copyright.** You keep all rights you have in your Contribution.
   This agreement grants a license; it does not transfer ownership.

3. **Copyright license.** You grant the Maintainer, and the Maintainer's successors
   and assigns, a perpetual, worldwide, non-exclusive, no-charge, royalty-free,
   irrevocable license to use, reproduce, modify, prepare derivative works of,
   publicly display, publicly perform, sublicense and distribute your Contribution
   and derivative works of it, under any license terms, including proprietary ones.

4. **Patent license.** If you own or control patents that your Contribution would
   infringe, you grant the Maintainer, the Maintainer's successors and assigns, and
   everyone who receives software that includes your Contribution, a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable license under those
   patents to make, use, sell, offer to sell, import and otherwise transfer that
   software.

5. **Open-source availability.** Your Contribution will also be available to everyone
   under the GNU General Public License, version 3 or later, as part of this
   repository.

6. **Your right to contribute.** You confirm that your Contribution is your original
   work, or that you have the right to submit it under these terms. If your employer
   or anyone else has rights in it, you confirm that they have allowed you to submit
   it under these terms. If your Contribution includes someone else's work, you
   identify it and its license in your pull request.

7. **No obligation.** The Maintainer does not have to use your Contribution. You
   provide it "as is", without warranties of any kind, and you have no obligation to
   support it.
