#!/bin/bash
B=localhost:3000/api
H='Content-Type: application/json'
E=ana$RANDOM@demo.com
echo "1) Registro"; curl -s -H "$H" -d "{\"email\":\"$E\",\"name\":\"Ana\",\"password\":\"Clave1234!\"}" $B/users/register; echo; echo
echo "2) Validacion Zod (campo role no permitido)"; curl -s -H "$H" -d '{"email":"x@y.com","name":"A","password":"p","role":"ADMIN"}' $B/users/register; echo; echo
echo "3) Login (devuelve JWT)"; R=$(curl -s -H "$H" -d "{\"email\":\"$E\",\"password\":\"Clave1234!\"}" $B/users/login); echo "$R" | cut -c1-200; echo
T=$(echo "$R" | sed 's/.*"token":"\([^"]*\)".*/\1/'); ID=$(echo "$R" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
echo "4) Sin token -> 401"; curl -s $B/users/me; echo; echo
echo "5) /me con token"; curl -s -H "Authorization: Bearer $T" $B/users/me; echo; echo
echo "6) USER intenta crear sala -> 403"; curl -s -H "$H" -H "Authorization: Bearer $T" -d '{"name":"Sala X","capacity":4,"hourlyRate":10}' $B/rooms; echo; echo
echo "7) Cargar saldo"; curl -s -H "$H" -H "Authorization: Bearer $T" -d '{"amount":200}' $B/users/$ID/balance; echo; echo
echo "8) Logout"; curl -s -X POST -H "Authorization: Bearer $T" $B/users/logout; echo; echo
echo "9) Mismo token despues de logout -> 401"; curl -s -H "Authorization: Bearer $T" $B/users/me; echo
