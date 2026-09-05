import { PCB } from '@typecad/typecad';
import { rd_isl9120ir } from './rd_ISL9120IR';

const typecad = new PCB('rd_isl9120_impl');
const isl9120 = new rd_isl9120ir({ pcb: typecad });

typecad.create(isl9120.components);
