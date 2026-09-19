-- Cerrar el acceso: de "cualquiera con el enlace" a "sólo quienes tengan cuenta".
--
-- Ejecutar SÓLO cuando las cuentas del equipo ya estén creadas en
-- Authentication → Users, o nadie va a poder entrar.
--
-- Después de correr esto, la aplicación muestra una pantalla de acceso.

do $$
declare t text;
begin
  foreach t in array array['equipos','seguimiento','observaciones','proyectos','pasos',
                           'hitos','agenda','integrantes','enlaces']
  loop
    execute format('drop policy if exists "acceso equipo" on %I', t);
    execute format(
      'create policy "acceso equipo" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Para volver atrás, cambiar 'authenticated' por 'anon' y ejecutar de nuevo.
