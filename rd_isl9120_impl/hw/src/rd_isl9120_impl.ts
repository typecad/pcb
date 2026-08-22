import { PCB } from "@typecad/typecad"
import { rd_isl9120ir } from "./rd_ISL9120IR";

let typecad = new PCB('rd_isl9120_impl');
let isl9120 = new rd_isl9120ir({ pcb: typecad });


typecad.create(isl9120.components);
