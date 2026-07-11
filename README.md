# Factorio Ship Paint

Factorio Ship Paint is a lightweight, responsive web tool that allows you to easily design your Factorio Space Age space platform foundations and export them directly to the game via blueprint strings.

## Features

- **Infinite Canvas:** A fully zoomable and pannable infinite canvas to design platforms of any size.
- **Factorio Blueprint Export:** Instantly export your drawing to a Factorio blueprint string (using `space-platform-foundation`).
- **URL Sharing:** Instantly share your platform designs using extremely compressed URL hashes.
- **Mobile Friendly:** Full support for multi-touch pinch-to-zoom, panning, and drawing on phones and tablets.

## Dependencies

This is a static, vanilla HTML/CSS/JS application. There are no build tools (like Webpack or Vite) or Node.js dependencies required to run or edit this project.

The application relies on one external library, which is automatically fetched via CDN:
- **[pako](https://github.com/nodeca/pako)**: Used for fast zlib inflate/deflate compression for Factorio blueprint generation and URL state sharing.

## How to Build and Deploy Locally

Because this is a static site without a build step, deploying locally is as simple as running a local web server in the project directory.

### 1. Clone the repository
```bash
git clone https://github.com/mikehaney24/factorio-ship-paint.git
cd factorio-ship-paint
```

### 2. Run a local web server
You can use Python's built-in HTTP server to serve the files locally.

```bash
# Using Python 3
python3 -m http.server 8080
```

### 3. Open in your browser
Navigate to `http://localhost:8080` in your web browser. Any changes you make to the `.html`, `.css`, or `.js` files will be immediately reflected upon refreshing the page.

## Support

If you find this tool helpful, consider buying me a beverage!

[![Buy me a beverage](https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20beverage&emoji=&slug=mikehaney24&button_colour=5F7FFF&font_colour=ffffff&font_family=Cookie&outline_colour=000000&coffee_colour=FFDD00)](https://www.buymeacoffee.com/mikehaney24)
