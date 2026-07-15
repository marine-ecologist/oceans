

from pymavlink import mavutil
import datetime
import csv
import pytz

# --- Change file path to recent bin, find this 
# --- on floaty's SD card in APM > Logs > xxxx.bin ---
path = "/Users/rof011/Desktop/00000061.BIN"
m = mavutil.mavlink_connection(path)

rows = []

gps_epoch = datetime.datetime(1980, 1, 6, 0, 0, 0)
aest = pytz.timezone("Australia/Brisbane")

ref_week    = None
ref_ms      = None
ref_timeus  = None
ref_dt_utc  = None

last_gps_status = None
last_gps_sats   = None
last_gps_hdop   = None

last_output_second = None


while True:
    msg = m.recv_match()
    if msg is None:
        break

    d = msg.to_dict()
    t_us = d.get("TimeUS")

    # --- GPS: collect timestamp + diagnostics ---
    if d.get("mavpackettype") == "GPS":
        last_gps_status = d.get("Status")
        last_gps_sats   = d.get("NSats")
        last_gps_hdop   = d.get("HDop")

        week = d.get("GWk")
        ms   = d.get("GMS")

        if week and ms and week > 2000 and ref_week is None:
            ref_week    = week
            ref_ms      = ms
            ref_timeus  = t_us
            ref_dt_utc  = gps_epoch + datetime.timedelta(
                weeks=week,
                milliseconds=ms
            )
        continue

    # --- AHR2: only output once per whole second ---
    if d.get("mavpackettype") == "AHR2" and ref_dt_utc is not None:

        dt = ref_dt_utc + datetime.timedelta(
            microseconds=(t_us - ref_timeus)
        )
        dt_aest = dt.replace(tzinfo=pytz.utc).astimezone(aest)

        sec = int(dt.timestamp())

        if sec == last_output_second:
            continue
        last_output_second = sec

        rows.append({
            "time"      : dt_aest.isoformat(),
            "lat"       : d.get("Lat"),
            "lon"       : d.get("Lng"),
            "alt"       : d.get("Alt"),
            "pitch"     : d.get("Pitch"),
            "roll"      : d.get("Roll"),
            "yaw"       : d.get("Yaw"),
            "gps_status": last_gps_status,
            "gps_sats"  : last_gps_sats,
            "gps_hdop"  : last_gps_hdop
        })

csv_path = "/Users/rof011/Desktop/00000061_ts.csv"

with open(csv_path, "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=rows[0].keys())
    w.writeheader()
    w.writerows(rows)

csv_path