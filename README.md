# HAR Analyser

A cross-platform HTTP Archive (HAR) file analyzer built with Tauri, React, TypeScript, and ShadUI.

## Features

- **HAR File Viewing**: Open and analyze HAR files with a clean, intuitive interface
- **Request/Response Details**: View detailed information about HTTP requests and responses
- **Waterfall Visualization**: See timing information in a visual waterfall chart
- **Request Replay**: Edit and replay requests directly from the application
- **Content Formatting**: Automatically formats JSON, HTML, CSS, and other content types
- **Cross-Platform**: Works on Windows, macOS, and Linux

## Screenshots

(Screenshots will be added after the first release)

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or later)
- [Rust](https://www.rust-lang.org/) (v1.60 or later)
- [Tauri CLI](https://tauri.app/v1/guides/getting-started/prerequisites)

### Setup

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/har-analyser.git
   cd har-analyser
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Run the development server:
   ```
   npm run tauri dev
   ```

### Building

To build the application for your current platform:

```
npm run tauri build
```

## Project Structure

- `src-tauri/`: Rust backend code
  - `src/main.rs`: Main entry point for the Tauri application
  - `Cargo.toml`: Rust dependencies
  - `tauri.conf.json`: Tauri configuration
- `src/`: Frontend code
  - `main.tsx`: Entry point for the React application
  - `App.tsx`: Main React component
  - `components/`: UI components
  - `lib/`: Utility functions

## Technologies Used

- [Tauri](https://tauri.app/): Framework for building cross-platform applications
- [React](https://reactjs.org/): Frontend UI library
- [TypeScript](https://www.typescriptlang.org/): Type-safe JavaScript
- [ShadUI](https://ui.shadcn.com/): UI component library
- [Tailwind CSS](https://tailwindcss.com/): Utility-first CSS framework
- [Vite](https://vitejs.dev/): Frontend build tool

## License

MIT