-- Ninguém fichado ainda (nov/2026): novos funcionários entram sem desconto de INSS/VT até serem registrados.
alter table funcionarios alter column desconta_inss set default false;
