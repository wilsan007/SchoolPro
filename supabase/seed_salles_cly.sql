-- Seed: Création de 14 salles pour le tenant cly-djibouti-tenant-0001
-- Table: salles (model Salle dans Prisma)
-- Champs: id (cuid), tenantId, nom, capacite, type, batiment

INSERT INTO salles (id, "tenantId", nom, capacite, type, batiment) VALUES
  ('cly-salle-01', 'cly-djibouti-tenant-0001', 'Salle 101', 40, 'cours',     'Bâtiment A'),
  ('cly-salle-02', 'cly-djibouti-tenant-0001', 'Salle 102', 40, 'cours',     'Bâtiment A'),
  ('cly-salle-03', 'cly-djibouti-tenant-0001', 'Salle 103', 35, 'cours',     'Bâtiment A'),
  ('cly-salle-04', 'cly-djibouti-tenant-0001', 'Salle 104', 35, 'cours',     'Bâtiment A'),
  ('cly-salle-05', 'cly-djibouti-tenant-0001', 'Salle 201', 40, 'cours',     'Bâtiment B'),
  ('cly-salle-06', 'cly-djibouti-tenant-0001', 'Salle 202', 40, 'cours',     'Bâtiment B'),
  ('cly-salle-07', 'cly-djibouti-tenant-0001', 'Salle 203', 35, 'cours',     'Bâtiment B'),
  ('cly-salle-08', 'cly-djibouti-tenant-0001', 'Salle 204', 35, 'cours',     'Bâtiment B'),
  ('cly-salle-09', 'cly-djibouti-tenant-0001', 'Labo Sciences', 30, 'labo',  'Bâtiment C'),
  ('cly-salle-10', 'cly-djibouti-tenant-0001', 'Labo Physique', 30, 'labo',  'Bâtiment C'),
  ('cly-salle-11', 'cly-djibouti-tenant-0001', 'Salle Informatique 1', 25, 'informatique', 'Bâtiment C'),
  ('cly-salle-12', 'cly-djibouti-tenant-0001', 'Salle Informatique 2', 25, 'informatique', 'Bâtiment C'),
  ('cly-salle-13', 'cly-djibouti-tenant-0001', 'Salle de Dessin', 30, 'arts', 'Bâtiment C'),
  ('cly-salle-14', 'cly-djibouti-tenant-0001', 'Gymnase / EPS', 60, 'sport', 'Bâtiment D')
ON CONFLICT (id) DO NOTHING;
