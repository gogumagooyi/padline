# Padline

Padline is a 4×4 rhythm game with two synthesized tracks. Press a glowing pad’s row and column keys together in time with the beat to score points and build a combo.

## Play locally

Download and extract the project, then open `index.html` in a browser. Press **Enter** or select **Start** to open the mode menu. Choose **Normal Mode**, then pick **Neon Skyline** (120 BPM) or **Afterglow** (100 BPM). Selecting a track starts its count-in. The other modes display an under-development message.

The game runs entirely in the browser, including its synthesized audio and local personal-best score.

## Screen links

Each screen has its own URL fragment. Append a fragment to the game URL to open that screen directly. Browser Back and Forward move through the screens you visited.

| Screen | URL fragment |
| --- | --- |
| Start | `#start` |
| Mode selection | `#modes` |
| Normal Mode song selection | `#songs/normal` |
| Neon Skyline game board | `#play/normal/neon-skyline` |
| Afterglow game board | `#play/normal/afterglow` |

Opening a game board directly loads the track and waits for you to select **Start**.

## Controls

| | First | Second | Third | Fourth |
| --- | --- | --- | --- | --- |
| Row, top to bottom | A | S | D | F |
| Column, left to right | J | K | L | ; |

For row 2, column 2, press **S** and **K** together. Either key can land first. The presses must overlap and begin within 120 milliseconds of each other. Release the keys and play a fresh pair for each note.

On a touchscreen, use two fingers to press one on-screen row key and one column key together.
