# Valorant Map Pick & Ban

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.0.0.

## Overview
This project mimics VALORANT Premier and VCT's pick-ban systems. In each match, a map pool of 7 will be narrowed down to either 1 or 3 and is decided by both teams. To make this process work online, I used WebSockets and developed a socket-based C++ backend from scratch to make match updates appear instantaneously on multiple devices at once.

## Production

This project is currently deployed on GitHub Pages, check it out here: https://warren-xu.github.io/ValPicks-frontend/

## Development server

To start a local development server, run:

```bash
npm start
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Building

To build the project run:

```bash
ng build
```
