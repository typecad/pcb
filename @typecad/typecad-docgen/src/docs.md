---
stylesheet: ./styles/example.css
highlight: vitesse-dark
title: atmos Project Documentation
board_name: atmos
variant: released
revision: 1
date: 3/25/2025
kicad_theme: Microfire
company: 
dark_mode: true
---

# atmos Project

|                       Top View                        |                      Bottom View                      | Description                                                                                                                                |
| :---------------------------------------------------: | :---------------------------------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------ | 
| ![{Render/front/80/10/10}](./images/render-display.png) | ![{Render/bottom/0/10/170}](./images/back-render.png) | FABRICATION NOTES (UNLESS OTHERWISE SPECIFIED)                                                                                             | \
|                                                       |                                                       | 1. OUTLINE DEFINED IN SEPARATE GERBER FILE WITH "Edge_Cuts.GBR" SUFFIX. DIMENSIONS OF CIRCUMSIZED RECTANGLE SHOWNON THIS DWG FOR REF ONLY. | \
|                                                       |                                                       | 2. SEE SEPARATE DRILL FILES WITH ".DRL" SUFFIX FOR HOLE LOCATIONS. SELECTED HOLE LOCATIONS SHOWN ON THIS DWG FOR REF ONLY.                 |

# Top Assembly

|                                    Top View                                    |                        Render                         | Description |
| :----------------------------------------------------------------------------: | :---------------------------------------------------: | --- |
| ![{Edge.Cuts,F.Cu,F.Fab,F.Mask}](./images/front-assembly.png) | ![{Render/front/90/0/0}](./images/front-render.png) | Assembly notes: | \
|                                                                                   |                                                        | 1. Do not populate parts marked with a black cross | \
|                                                                                   |                                                        | 2. Do not populate parts not present in the BOM | \
|                                                                                   |                                                        | 3. In the case of conflicting information, the BOM takes precedence |

# Bottom Assembly

|                                    Bottom View                                    |                        Render                         | Description |
| :----------------------------------------------------------------------------: | :---------------------------------------------------: | --- |
| ![{Edge.Cuts,B.Cu,B.Fab,B.Mask,B.Silkscreen}](./images/bottom-assembly.png) | ![{Render/bottom/0/0/180}](./images/bottom-render.png) | Assembly notes: | \
|                                                                                   |                                                        | 1. Do not populate parts marked with a black cross | \
|                                                                                   |                                                        | 2. Do not populate parts not present in the BOM | \
|                                                                                   |                                                        | 3. In the case of conflicting information, the BOM takes precedence |

# Technical
|                                    Dimensions                                    |                        Drill                         | Description |
| :----------------------------------------------------------------------------: | :---------------------------------------------------: | --- |
| ![{Edge.Cuts,User.5}](./images/dimensions.png) |![{Edge.Cuts,User.6}](./images/drills.png)| ![{Stackup}](./images/stackup.png) |


this is some interesting information that will be useful in describing this pcb and how it should be manufactured and that sort of thing. 

# System Block

https://www.plantuml.com/plantuml/uml/SyfFKj2rKt3CoKnELR1Io4ZDoSa70000
```plantuml
!theme sandstone
'hide empty description
'!pragma layout elk
skinparam rectangleBorderThickness 1
skinparam defaultTextAlignment center
skinparam lifelineStrategy solid
skinparam monochrome true
skinparam style strictuml
hide empty members
skinparam Linetype ortho

rectangle "Базовые модули" as base {

class "Базовые объекты" as baseobjects
class "Делопроизводство\n4.5" as takeoffice
class "Управление\nпроцессами" as workflow
class "Windows-клиент" as windowsclient

class "Управление\nдокументами" as documentmanagement
class "Конструктор\nсогласований" as approvaldesigner

class "Платформа" as platform
class "Служба\n фоновых операций" as worker

}

platform <-- baseobjects
platform <-- workflow
platform <-- takeoffice
platform <-- windowsclient
platform <-- documentmanagement
platform <-- approvaldesigner

windowsclient -up-> approvaldesigner
windowsclient -up-> documentmanagement
windowsclient -up-> baseobjects
windowsclient -up-> takeoffice
windowsclient -up-> workflow

worker <-- approvaldesigner
worker <-- baseobjects
```