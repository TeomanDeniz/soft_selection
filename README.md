# Selection JS

Soft, gooey text selection highlights that follow your text everywhere: inside scroll boxes, and on moved, scaled, rotated or skewed elements. Optional animations when the user copies.

<p align="center">
 <a href="https://teomandeniz.github.io/SELECTION_JS/"><img src="https://img.shields.io/badge/Live_Demo-Open-E84A8C?style=for-the-badge" alt="Live Demo"/></a>
</p>

![Preview_1](https://github.com/user-attachments/assets/e039186d-03d0-4639-a941-8e45f0fb76ec)

![Preview_2](https://github.com/user-attachments/assets/533e179e-586d-4fd8-8dd0-86f5791a366d)

![Preview_3](https://github.com/user-attachments/assets/904667b5-a587-40e4-99cf-2f3712d15cff)

https://github.com/user-attachments/assets/ef423119-6afd-4fa4-b400-94299f475748

## Features

* One highlight per line, merged smoothly, in any selection direction.
* Exact on transformed elements: `translate`, `scale`, `rotate`, `skew`, including while they animate.
* Follows scroll boxes and is cut at their edges, even inside rotated elements.
* Works on elements added at any time.
* Copy animations for Ctrl+C, Cmd+C, right-click Copy, and the Edit menu.
* No CSS file, container, or SVG filter to paste. The library adds what it needs.

## Install

Classic script:

```html
<script src="soft_selection.js"></script>
<script>
	soft_selection.start({ color: "#E84A8C" });
</script>
```

ES module (keep `soft_selection.js` next to it):

```js
import soft_selection from "./soft_selection.mjs";

soft_selection.start({ color: "#E84A8C" });
```

The script can be placed anywhere, including `<head>`.

## Usage

Mark the elements that should get the effect:

```html
<p data-selection>Default color.</p>
<p data-selection="#7A5AF5">Its own color.</p>
<p>Normal browser selection.</p>
```

The highlight is drawn **behind** your content, so the content needs to sit above it:

```css
main
{
	position: relative;
	z-index: 1;
}

[data-selection]::selection,
[data-selection] *::selection
{
	color: white;
}
```

Because the highlight is behind the content, a background color on an element *inside* that content covers it. Keep selectable areas transparent, or give their background to an element outside the layered content.

### Options

| Option          | Default     | Meaning                                                                    |
| --------------- | ----------- | -------------------------------------------------------------------------- |
| `color`         | `"#E84A8C"` | Default highlight color. Any CSS color, or a number like `0xE84A8C`.       |
| `goo`           | `true`      | `false` for plain boxes, or `{ blur: 2, sharpness: 18, threshold: -4 }`.   |
| `on_copy`       | none        | Function called on copy for elements without their own handler.            |
| `copy_handlers` | `{}`        | Named copy functions, used by `data-selection-oncopy`.                     |
| `copy_duration` | `300`       | How long (ms) the `data-copied` attribute stays on boxes after a copy.     |
| `container`     | created     | Element or selector for the highlight layer. Uses `#SELECTION_CONTAINER` if it exists. |
| `hide_native`   | `true`      | Makes the browser's own selection background transparent on `[data-selection]`. |

### Colors

The color of an element is chosen in this order:

1. The `data-selection="#..."` attribute value.
2. The CSS variable `--selection-color` (handy for themes and dark mode).
3. The `color` option.

```css
.card { --selection-color: #0F9D8A; }
```

### Copy animations

With CSS only, use the `data-copied` attribute:

```css
.selection_box[data-copied] { filter: brightness(1.4); }
```

With JavaScript, give an element a handler name:

```html
<p data-selection data-selection-oncopy="flash">Copy me.</p>
```

Then register it:

```js
soft_selection.start({
	copy_handlers: {
		flash: function (color, box, element)
		{
			box.style.backgroundColor = "#FFF";
			setTimeout(function () { box.style.backgroundColor = color; }, 120);
		}
	}
});
```

A global function with that name (`window.flash`) also works, as before. Handlers receive the box color, the highlight box, and the `[data-selection]` element.

### Styling the boxes

Each line is a `.selection_box`. The default is a short, smooth transition, turned off for users who ask for reduced motion. Override it freely:

```css
.selection_box
{
	border-radius: 4px;
	transition: left 150ms, top 150ms, width 150ms, height 150ms;
}
```

Transitions only animate selection changes. Scrolling and transforms move the highlight instantly, so it never lags behind the text.

### Controlling it later

```js
const selection = soft_selection.start({ color: "#E84A8C" });

selection.set_color("#7A5AF5");
selection.set_goo(false);
selection.set_on_copy(function (color, box) { /* ... */ });
selection.add_copy_handler("shake", shake_function);
selection.remove_copy_handler("shake");
selection.refresh();   // redraw right now
selection.stop();      // remove everything
```

## How it works

For every selected piece of text, the library measures its rectangles and merges them into one box per line. On transformed elements, the browser only reports tilted bounding boxes, so the library reads the element's transform and recovers the text's true position and size, then draws the box with the same transform. Scroll boxes and clipping elements become clip shapes around the highlight.

## Limitations

* 3D transforms with perspective are approximate.
* Text inside `<input>` and `<textarea>` keeps the browser's own selection.
* Highlights inside scroll boxes can trail one frame behind during very fast scrolling.

## Upgrading from `SOFT_SELECTION()`

| Before                                 | Now                                           |
| -------------------------------------- | --------------------------------------------- |
| `SOFT_SELECTION("#E84A8C", on_copy)`   | `soft_selection.start({ color: "#E84A8C", on_copy })` |
| `SELECTION.css`                        | Not needed anymore                            |
| `<div id="SELECTION_CONTAINER">`       | Optional (used if present)                    |
| `<svg>` with `#GOO_EFFECT` filter      | Not needed anymore                            |
| `.SELECTION_BOX`                       | `.selection_box`                              |
| Ctrl+C key detection                   | Any copy action                               |
