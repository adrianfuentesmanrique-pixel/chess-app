# Work order — captured verbatim from the retired chess session

This is Adrian's own message, exactly as he wrote it on 2026-08-05, saved so it
survives the session being closed. Nothing here has been paraphrased.

Two things to fix as you go:
- The Capablanca quote lost its characters to an encoding bug. It should read:
  "In order to improve your game, you must study the endgame before everything
  else." - Jose Raul Capablanca
- Item 2 says "De only one" - he means "The only one".

A photo of the Sentry errors was attached to the original message and is NOT
recoverable here. Ask him to re-attach it before starting item 1.

---

Implement the following changes. Prioritize clean architecture, maintain existing functionality, and ensure all new behavior is consistent across Android, iOS, and desktop. If you do need to work in another conversation for any of the task, just tell me which one and give me the prompt

---

# 1. Fix Sentry Errors (Photo attached)

* Review and resolve all current Sentry-reported errors.
* Ensure there are no regressions after the fixes.

---

# 2. Complete Missing Artwork

* Finish integrating all remaining artwork/assets that are still incomplete or missing. De only one without art is discovered check, let's keep all the discoveries into discovered, regardless if is a check or not. For the achievements that you are more than 3, I gave different colors like obsidian and gold, to use them in order with the borders.
* Verify proper rendering in both Light Mode and Dark Mode.

---

# 3. Improve Board Edit Buttons

* Redesign the **Edit Board** buttons to have a cleaner, more modern, and aesthetically pleasing appearance.
* Keep the UI consistent with the overall app design.

---

# 4. Remove Unnecessary Delete Button

Inside the **Board Setup** screen:

* Remove the **Trash Can** button.
* The delete functionality is already available through two other methods, making this button redundant.

---

# 5. Fix  Chess Board  Scrolling

Currently, in any of the tabs, the chess board  cannot be scrolled.

Please fix scrolling in every tab where the board list appears.

---

# 6. Play Tab Improvements

### Buttons

* Remove all text labels from the action buttons.
* Keep only their icons.

### Exception

* Replace the **New Game** button with a **Back** button located in the upper-left corner.
* This should behave like a standard navigation button and provide a more intuitive user experience.

---

# 7. Openings Tab Navigation

Apply the same navigation pattern used in the Play tab.

* Remove the **New Game** button.
* Add a **Back** button in the upper-left corner.

---

# 8. Learn Tab Reorganization

Reorganize the Learn section as follows:

## Sections

* Rules
* Basic Checkmates
* Endings

Move the current **Endgame** content into the new **Endings** section.

At the bottom of the Endings section, below **Minor Piece Endgames**, display the following quote:

> "In order to improve your game, you must study the endgame before everything else."
>
> — José Raúl Capablanca

Use elegant typography that matches the app's design.

---

# 9. Spanish Translation Fix

In the Spanish version of the Learn tab:

Replace:

* "Jaques Mate"

with:

* "Jaque mates"

Verify there are no similar translation inconsistencies elsewhere.

---

# 10. Opening Explorer Improvements

When navigating through moves:

* The user should be able to go backward to any previous move.
* From any previous position, the user should be able to play a different move, creating a variation.
* After selecting that alternative move, the application should continue automatically using the moves available from the currently selected opening database.
* Existing database functionality must remain intact.

---

# 11. Swipe Navigation Between Tabs

Add gesture navigation throughout the application.

## Horizontal Swipe

* Swiping left or right should move between adjacent tabs.

## Edge Swipe (Back Gesture)

* Swiping inward from the screen edge should navigate back to the previously opened tab.
* It should **not** immediately close the application.

Treat the **Analysis** tab as the application's home page.

Navigation example:

Analysis → Learn → Openings → Back → Learn → Back → Analysis

Only exit the application when the user is already on the Analysis tab and performs the appropriate system back action.

---

# 12. Reorder Bottom Navigation Tabs

Reorder the tabs in the following sequence:

1. Analysis
2. Learn
3. Bases
4. Openings
5. Puzzles
6. Play
7. Profile

Ensure icons, navigation state, routing, and animations continue working correctly after the reordering.

---

# Expected Outcome

After completing these changes:

* All Sentry issues should be resolved.
* Navigation should feel more intuitive.
* The UI should look cleaner and more modern.
* Board editing should be simplified.
* Scrolling should work correctly everywhere.
* Opening study should support creating variations naturally.
* Swipe navigation should provide a smooth, native experience.
* The Learn section should have a clearer educational structure.
* The bottom navigation should follow the new tab order consistently across the app.
