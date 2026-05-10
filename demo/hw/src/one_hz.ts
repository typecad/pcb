import { PCB } from '@typecad/typecad'
import { atmega1 } from "./atmega1";

let typecad = new PCB('uno');

let u1 = new atmega1({ pcb: typecad });

typecad.create(...u1.components);