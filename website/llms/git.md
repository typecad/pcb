# Git for Hardware Design

## Why Hardware Needs Version Control

Traditional hardware design tools create binary files that are impossible to meaningfully version control. typeCAD generates text-based TypeScript files that work perfectly with git, bringing modern version control to hardware design.

## Git Workflows for Hardware

### 🔍 **Meaningful Diffs**

```ts
// See exactly what changed in your circuit
let r1 = new Resistor({ value: "1kohm" }); // [!code --]
let r1 = new Resistor({ value: "10kohm" }); // [!code ++]

// Added pull-up resistor for I2C // [!code ++]
let r_pullup = new Resistor({ value: "4.7kohm" }); // [!code ++]
typecad.net(mcu.SDA, r_pullup.pin(1)); // [!code ++]
```

Unlike binary schematic files, git diffs show you exactly which components changed, what connections were added, and the reasoning behind each modification.

### 🌿 **Feature Branches for Circuit Development**

```bash
git checkout -b feature/add-usb-connector
# Develop USB connector circuit
git add src/usb-connector.ts
git commit -m "Add USB-C connector with ESD protection"

git checkout -b feature/power-supply-redesign
# Redesign power supply in parallel
git add src/power-supply.ts
git commit -m "Switch to buck converter for better efficiency"
```

Develop different circuit features in parallel without conflicts. Test each design independently before merging.

### 📋 **Commit Messages That Matter**

```bash
git commit -m "Fix: Increase decoupling cap to 10uF for stability"
git commit -m "Add: Current limiting resistor for LED protection"
git commit -m "Refactor: Extract common power supply to shared module"
```

Document the electrical reasoning behind each change. Future you (and your team) will thank you when debugging.

### 🔄 **Hardware Design Reviews**

```typescript
// Pull request review comments on actual circuit code
let r_current = new Resistor({ value: "100ohm" }); // 👈 "This seems high for LED current limiting"

typecad.net(mcu.GPIO1, led.anode); // 👈 "Missing current limiting resistor"
```

Review hardware designs like software code. Comment on specific lines, suggest improvements, and ensure design quality before merging.

## Git vs. Traditional Hardware Workflows

| Traditional Hardware Tools            | typeCAD + Git                              |
| ------------------------------------- | ------------------------------------------ |
| 📁 `circuit_v1.sch`, `circuit_v2.sch` | 🏷️ Semantic versioning with tags           |
| � Manual file backups                 | �P Automatic distributed backups           |
| ❓ "What changed?" mystery files      | 📝 Clear commit history with reasoning     |
| � Email schematics for review         | 🔍 Pull request reviews with line comments |
| 🚫 No parallel development            | 🌿 Feature branches for concurrent work    |
| 📧 "Latest version" email chains      | 🎯 Single source of truth in main branch   |

## Real-World Git Workflow

**Scenario:** Adding a new sensor to an existing design

```bash
# Start from stable main branch
git checkout main
git pull origin main

# Create feature branch
git checkout -b feature/add-temperature-sensor

# Implement the sensor circuit
# Edit src/sensors.ts to add DS18B20 temperature sensor
git add src/sensors.ts
git commit -m "Add DS18B20 temperature sensor with pull-up"

# Test the design
npm run build
# Verify in KiCAD, run ERC checks

# Push and create pull request
git push origin feature/add-temperature-sensor
# Create PR for team review

# After review and approval
git checkout main
git merge feature/add-temperature-sensor
git tag v1.2.0 -m "Release with temperature sensing"
```

## Team Collaboration Benefits

### 🤝 **Distributed Development**

Multiple engineers can work on different parts of the same PCB simultaneously without file conflicts.

### 📚 **Design History**

Complete audit trail of every design decision with timestamps and author information.

### 🔒 **Release Management**

Tag stable releases, maintain multiple product versions, and apply hotfixes to specific versions.

### 🌍 **Remote Collaboration**

Share designs instantly with global teams. No more emailing large binary files.

## The Hardware Git Advantage

Git transforms hardware design from a single-user, file-based workflow into a collaborative, version-controlled process:

- **Traceability**: Every change is documented with author and reasoning
- **Reliability**: Never lose work, always have backups
- **Collaboration**: Multiple engineers working together seamlessly
- **Quality**: Code review processes catch design errors early
- **Speed**: Parallel development of different circuit sections

Ready to bring modern version control to your hardware designs?

[Get Started →](/getting-started)