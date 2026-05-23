---
title: typeCAD 1Hz
company: typeCAD
board_name: typeCAD 1Hz
kicad_theme: typeCAD-dark
dark_mode: true
---

# 1Hz

|                 Stackup                 |                        Dimensions                         |                Drills                |
| :-------------------------------------: | :-------------------------------------------------------: | :----------------------------------: |
| ![{Stackup}](./images/stackup.png =550) | ![{Edge.Cuts,User.1,F.Fab}](./images/dimensions.png =350) | ![{Drill}](./images/drills.png =350) |

# Top

![{F.Cu}](./images/fcu.png =550)

# Bottom

![{B.Cu}](./images/bcu.png =550)
_flipped_

# Renders

|                          Top View                          |                        Bottom View                        |
| :--------------------------------------------------------: | :-------------------------------------------------------: |
| ![{Render/front/90/0/0}](./images/render-display.png =550) | ![{Render/bottom/0/0/360}](./images/back-render.png =550) |

# Top Assembly

|                              Top View                              |                      Render                       |
| :----------------------------------------------------------------: | :-----------------------------------------------: |
| ![{Edge.Cuts,F.Cu,F.Mask,F.Fab}](./images/front-assembly.png =550) | ![Front render](./images/render-display.png =550) |

# Bottom Assembly

|                        Bottom View                        |                     Render                      |
| :-------------------------------------------------------: | :---------------------------------------------: |
| ![{B.Cu,B.Mask,B.Fab}](./images/bottom-assembly.png =550) | ![Bottom render](./images/back-render.png =550) |

# Test Points

The circuit includes four test points for verification and debugging:

| Test Point | Signal | Frequency | Purpose | Location |
|:------------:|:--------:|:-----------:|:---------:|:----------:|
| **TP1** | TCXO Output | 4.194304 MHz | Verify oscillator operation | U1 Pin 3 |
| **TP2** | First Division | 256 Hz | Verify 74HC4060 operation | U2 Pin 3 (Q14) |
| **TP3** | Final Division | 1 Hz (unbuffered) | Verify 74HC4040 operation | U3 Pin 1 (Q8) |
| **TP4** | Buffered Output | 1 Hz (buffered) | Verify 74HC244 operation | U4 Pin 8 |

# Bill of Materials

| Reference | Component | Value/Part Number | Package | Description | Estimated Cost |
|:-----------:|:-----------:|:-------------------:|:---------:|:-------------:|:----------------:|
| **U1** | TCXO | SIT8008BI-82-30E-4.194304 | SMD 5.0x3.2mm | 4.194304 MHz TCXO, ±25ppm, 3V | $15.00 |
| **U2** | Binary Counter | 74HC4060N | DIP-16 | 14-stage binary counter with oscillator | $1.50 |
| **U3** | Binary Counter | 74HC4040N | DIP-16 | 12-stage binary counter | $1.25 |
| **U4** | Buffer/Driver | 74HC244N | DIP-20 | Octal buffer/line driver | $1.75 |
| **C1** | Capacitor | 100nF | 0603 | TCXO decoupling capacitor | $0.05 |
| **C2** | Capacitor | 100nF | 0603 | 74HC4060 decoupling capacitor | $0.05 |
| **C3** | Capacitor | 100nF | 0603 | 74HC4040 decoupling capacitor | $0.05 |
| **C4** | Capacitor | 100nF | 0603 | 74HC244 decoupling capacitor | $0.05 |
| **C5** | Capacitor | 10µF | 0603 | 3V rail bulk filtering | $0.15 |
| **C6** | Capacitor | 10µF | 0603 | 5V rail bulk filtering | $0.15 |
| **R1** | Resistor | 10kΩ | 0603 | 74HC4060 reset pull-down | $0.02 |

# Mathematical Calculations

### TCXO → 74HC4060
$$
4,194,304"Hz" / 16,384 = 256 "Hz"
$$

### 74HC4060 → 74HC4040
$$
256"Hz" / 256 = 1 "Hz"
$$

### Output Accuracy
- TCXO ±25ppm

$$
±25"ppm" × 86,400 "seconds/day" = ±2.16 "seconds per day"
$$

# Signal Path

```plantuml
@startuml
!theme plain

title 1Hz Precision Generator - Signal Path Flow

participant "TCXO (U1)\nSIT8008BI-82-30E\n4.194304 MHz ±25ppm" as TCXO
participant "74HC4060 (U2)\n14-Stage Binary Counter\n÷16,384" as U2
participant "74HC4040 (U3)\n12-Stage Binary Counter\n÷256" as U3  
participant "74HC244 (U4)\nOctal Buffer/Driver" as U4
participant "Output Connector (J2)\n1Hz Output" as OUTPUT

== Primary Signal Path ==

TCXO -> U2 : 4.194304 MHz
note right : Pin 3 → Pin 10\nClock Input\n±25ppm precision
U2 -> U3 : 256 Hz
note right : Pin 3 (Q14) → Pin 10\nDivide by 16,384\n(2^14)
U3 -> U4 : 1 Hz (unbuffered)
note right : Pin 1 (Q8) → Pin 3\nDivide by 256\n(2^8)
U4 -> OUTPUT : 1 Hz (buffered)
note right : Pin 8 → Pin 2\nClean drive capability\n50mA output current

@enduml
```