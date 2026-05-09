---
title: typeCAD has an /llms.txt file
description: Use AI to create reference designs from a datasheet
date: '2025-7-6'
categories:
  - tools
  - llm
  - ai
published: true
cover: https://unsplash.com/photos/OPpCbAAKWv8/download?ixid=M3wxMjA3fDB8MXxzZWFyY2h8MjJ8fGNoYWxrYm9hcmQlMjB3aXRoJTIwYSUyMGxvdCUyMG9mJTIwdGV4dHxlbnwwfDB8fHwxNzUxODI0NzE5fDA&force=true&w=640
---

# The llms.txt standard
The standard is defined at at their website: [llms-txt](https://llmstxt.org/). Basically, it is a way to document projects for easy use with AI. 

## Example use

Most any LLM model allows file usage; download [`/llms-full.txt`](/llms-full.txt), provide it to your LLM, then ask it anything about **type**CAD. It should have the entire website and API available as a source of information. 

Embed [`/llms-full.txt`](/llms-full.txt) into a vector database and create your own agents. [Langflow](https://www.langflow.org/) or [Flowise](https://flowiseai.com/) work well for this. A scraper could also be used to download all the markdown files for more specific or fine-tuned approaches.