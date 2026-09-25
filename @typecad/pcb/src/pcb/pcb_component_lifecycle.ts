import { Component } from '../component.js';
import { TrackBuilder } from './pcb_track_builder.js';
import type { PcbInternalState } from './pcb_state.js';

export function placeComponent(state: PcbInternalState, component: Component): void {
  unstageComponent(state, component);
  if (component.dnp === true) return;
  state.components.push(component);
}

export function stageComponent(state: PcbInternalState, component?: Component): void {
  if (!component || component.dnp === true) {
    return;
  }

  const uuid = component.uuid;
  if (state.stagedComponents.some((existing) => existing.uuid === uuid)) {
    return;
  }

  state.stagedComponents.push(component);
}

export function unstageComponent(state: PcbInternalState, component?: Component): void {
  if (!component) {
    return;
  }

  const uuid = component.uuid;
  const index = state.stagedComponents.findIndex((existing) => existing.uuid === uuid);
  if (index !== -1) {
    state.stagedComponents.splice(index, 1);
  }
}

export function groupComponents(
  state: PcbInternalState,
  placeFn: (...components: Component[]) => void,
  group_name: string,
  ...items: Array<Component | TrackBuilder>
): void {
  let uuid_list = '';
  const componentsToPlaceAndProcess: Component[] = [];

  items.forEach((item) => {
    if (item && typeof item === 'object' && 'reference' in item) {
      componentsToPlaceAndProcess.push(item);
    } else if (item instanceof TrackBuilder) {
      const builderElements = item.getElements();
      builderElements.forEach((element) => {
        uuid_list += `"${element.uuid}" `;
      });
    }
  });

  if (componentsToPlaceAndProcess.length > 0) {
    placeFn(...componentsToPlaceAndProcess);

    componentsToPlaceAndProcess.forEach((_component) => {
      if (_component.dnp === true) {
        return;
      }
      uuid_list += `"${_component.uuid}" `;

      if (!_component.groups.includes(group_name)) {
        _component.groups.push(group_name);
      }
    });
  }

  const existingGroupIndex = state.groups.findIndex((group) => group.startsWith(`(group "${group_name}"`));

  const newGroupString = `(group "${group_name}" (members ${uuid_list}))`;

  if (existingGroupIndex !== -1) {
    state.groups[existingGroupIndex] = newGroupString;
  } else {
    state.groups.push(newGroupString);
  }
}
