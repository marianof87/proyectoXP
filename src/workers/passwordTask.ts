/**
 * HU-13: tarea que ejecuta cada worker thread del pool de contraseñas.
 *
 * Usa la versión SÍNCRONA de bcrypt a propósito: dentro de un worker bloquea
 * solo ese hilo, que es justamente lo que se quiere (una tarea = un hilo
 * ocupado = un núcleo lógico trabajando). El hilo principal de Express queda
 * libre para seguir atendiendo peticiones.
 */

import bcrypt from 'bcrypt';

export type PasswordTask =
  | { op: 'hash'; password: string; rounds: number }
  | { op: 'compare'; password: string; hash: string };

export default function passwordTask(task: PasswordTask): string | boolean {
  return task.op === 'hash'
    ? bcrypt.hashSync(task.password, task.rounds)
    : bcrypt.compareSync(task.password, task.hash);
}
