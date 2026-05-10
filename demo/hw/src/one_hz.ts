import { PCB } from '@typecad/typecad'
import { Atmega1 } from "./atmega1";

let typecad = new PCB('uno');

let u1 = new Atmega1({ pcb: typecad });

typecad.create(...u1.components);