---
title: Private npm Packages
description: Host your own npm packages
date: '2025-3-17'
categories:
  - website
published: true
cover: https://unsplash.com/photos/f3Ug9b50KwI/download?ixid=M3wxMjA3fDB8MXxhbGx8fHx8fHx8fHwxNzQyMjQzNzYxfA&force=true&w=640
---
<br />

# Keeping your work private
[npm](https://www.npmjs.com/) is a great way to share your work with the world, but sometimes you may want to keep your work private or have more control over it. 

In those case, you can use [npm private packages](https://docs.npmjs.com/about-private-packages). You have to pay $7 per month per user. You can create private packages and publish them to your own private registry.

## Private Registry
Maybe you have a server that you can use. If so, you can use [verdaccio](https://verdaccio.org/) to create your own private registry.

It's just a single command to install and run. And using it is equally simple, just add a `--registry [server address]` to your `npm install` or `npm publish` command.