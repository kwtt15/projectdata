USE washy_realistic;
GO
-- 1: JOIN 1: booking list for the UI
SELECT b.booking_id,c.first_name,v.license_plate,p.package_name,b.start_time,b.booking_status FROM dbo.bookings b JOIN dbo.vehicles v ON v.vehicle_id=b.vehicle_id JOIN dbo.customers c ON c.customer_id=v.customer_id JOIN dbo.service_packages p ON p.package_id=b.package_id;

-- 2: JOIN 2: materials per service
SELECT b.booking_id,v.license_plate,m.material_name,u.quantity_used,u.quantity_used*u.unit_cost_snapshot material_cost FROM dbo.material_usage u JOIN dbo.materials m ON m.material_id=u.material_id JOIN dbo.bookings b ON b.booking_id=u.booking_id JOIN dbo.vehicles v ON v.vehicle_id=b.vehicle_id;

-- 3: HAVING 1: popular packages
SELECT package_id,COUNT(*) completed_jobs FROM dbo.bookings WHERE booking_status='Completed' GROUP BY package_id HAVING COUNT(*)>=10;

-- 4: HAVING 2: repeat customers
SELECT v.customer_id,COUNT(*) visits FROM dbo.bookings b JOIN dbo.vehicles v ON v.vehicle_id=b.vehicle_id WHERE booking_status='Completed' GROUP BY v.customer_id HAVING COUNT(*)>5;

-- 5: HAVING 3: high cash collection days
SELECT CONVERT(date,payment_date) paid_date,SUM(amount) cash_received FROM dbo.payments WHERE payment_method<>'Member_Credit' GROUP BY CONVERT(date,payment_date) HAVING SUM(amount)>1000;

-- 6: Subquery 1: packages above average price
SELECT * FROM dbo.service_packages WHERE price>(SELECT AVG(price) FROM dbo.service_packages);

-- 7: Subquery 2: customers without completed service
SELECT c.* FROM dbo.customers c WHERE NOT EXISTS(SELECT 1 FROM dbo.vehicles v JOIN dbo.bookings b ON b.vehicle_id=v.vehicle_id WHERE v.customer_id=c.customer_id AND b.booking_status='Completed');

-- 8: Correlated subquery 3: material use above its own average
SELECT u.* FROM dbo.material_usage u WHERE quantity_used>(SELECT AVG(x.quantity_used) FROM dbo.material_usage x WHERE x.material_id=u.material_id);

-- 9: Window 1: rank packages by completed service value
SELECT package_id,SUM(price_snapshot) service_value,RANK() OVER(ORDER BY SUM(price_snapshot) DESC) revenue_rank FROM dbo.bookings WHERE booking_status='Completed' GROUP BY package_id;

-- 10: Window 2: latest booking per vehicle
WITH ranked AS(SELECT *,ROW_NUMBER() OVER(PARTITION BY vehicle_id ORDER BY start_time DESC,booking_id DESC) rn FROM dbo.bookings) SELECT * FROM ranked WHERE rn=1;
