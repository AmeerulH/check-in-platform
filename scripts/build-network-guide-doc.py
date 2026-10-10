"""Build the team guide (.docx) for network problems. Upload the result to Google Drive and open it in Docs."""
import struct
import sys
from pathlib import Path

from docx import Document
from docx.shared import Inches, Pt

SHOTS = Path(sys.argv[1])
OUT = Path(sys.argv[2])


def png_size(path):
    with open(path, "rb") as handle:
        header = handle.read(24)
    return struct.unpack(">II", header[16:24])


def add_shot(doc, name, caption, left_fraction=None, width_in=2.4, top_fraction=0.0, bottom_fraction=1.0):
    """Crop to the app area. The screenshot canvas is 1024 wide; mobile content fills the left 214 px."""
    path = SHOTS / name
    width, height = png_size(path)
    picture = doc.add_picture(str(path), width=Inches(width_in))
    if left_fraction is not None:
        from docx.oxml import parse_xml
        blip_fill = picture._inline.graphic.graphicData.pic.blipFill
        blip_fill.insert(1, parse_xml(
            '<a:srcRect xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
            f't="{int(top_fraction * 100000)}" r="{int((1 - left_fraction) * 100000)}" '
            f'b="{int((1 - bottom_fraction) * 100000)}"/>'
        ))
        picture.width = Inches(width_in)
        picture.height = Inches(width_in / left_fraction * (height / width) * (bottom_fraction - top_fraction))
    note = doc.add_paragraph(caption)
    note.runs[0].italic = True
    note.runs[0].font.size = Pt(9)


doc = Document()
doc.add_heading("GTP 2026 Check-in: what to do if the network has problems", 0)
doc.add_paragraph(
    "Use this guide at the registration desk, 12-15 October 2026. Start with step 1 and only move down "
    "if the step above does not work. Nobody should be turned away because a phone or the website is slow."
)

doc.add_heading("Which step do I use?", level=1)
table = doc.add_table(rows=1, cols=3)
table.style = "Light Grid Accent 1"
for cell, text in zip(table.rows[0].cells, ["What is happening", "What you do", "Who"]):
    cell.text = text
for row in [
    ("Phone loses signal for a short time", "Keep scanning. Scans are saved on the phone and sent when signal returns.", "Scanners"),
    ("A guest's QR code will not scan or is missing", "Search for the guest by name and check them in (step 2).", "Scanners and organizers"),
    ("The website or the whole network is down", "Write arrivals on the printed roster, then upload it later (steps 3 and 4).", "Everyone, then an organizer"),
]:
    cells = table.add_row().cells
    for cell, text in zip(cells, row):
        cell.text = text

doc.add_heading("1. Short signal loss: keep scanning", level=1)
doc.add_paragraph("If the phone says the scan is queued, the guest has NOT been confirmed yet. That is normal.", style="List Bullet")
doc.add_paragraph("Keep the scanner page open. Do not close the tab or sign out. The phone retries by itself every 20 seconds and when signal returns.", style="List Bullet")
doc.add_paragraph("Tap Retry pending scans to try straight away.", style="List Bullet")
doc.add_paragraph("Scans that cannot be saved appear under Needs review with the reason. Tell an organizer. Dismiss them only after the guest is checked in another way.", style="List Bullet")
doc.add_paragraph("Queued scans count for the day they were scanned, as long as they upload within 72 hours.", style="List Bullet")

doc.add_heading("2. QR code will not scan: find the guest by name", level=1)
doc.add_paragraph("Open Scan pass. Under Find a guest, type at least 2 letters of the name, email or organisation.", style="List Number")
doc.add_paragraph("Match the guest, then tap Check in.", style="List Number")
doc.add_paragraph("Tap Confirm check-in. The guest shows as Checked in today. If they were already checked in, the screen says so and the count does not go up.", style="List Number")
doc.add_paragraph("Every manual check-in is recorded with your name. Only check in people you have seen.", style="List Number")
add_shot(doc, "mobile-1-find-guest-b.png", "On a phone: search, then Confirm check-in.", left_fraction=214 / 1024, width_in=2.4, top_fraction=0.0, bottom_fraction=0.745)
add_shot(doc, "demo-2-confirm.png", "On a laptop: the same steps on the Scan pass page.", width_in=6.0)

doc.add_heading("3. Website or network down: use the paper roster", level=1)
doc.add_paragraph("Do this before the event, not during it. An organizer opens Check-ins and taps Download roster each morning.", style="List Number")
doc.add_paragraph("Save the file on two phones or laptops and print one copy.", style="List Number")
doc.add_paragraph("If the site is down, tick people off on the printed copy, or type Y in the last column (Checked in (Y)) of the saved file. Keep one list per event day.", style="List Number")
doc.add_paragraph("Keep every list. Do not throw paper away until an organizer confirms the upload worked.", style="List Number")
add_shot(doc, "mobile-2-roster.png", "On a phone: Download roster is at the top of Check-ins.", left_fraction=214 / 1024, width_in=2.4, top_fraction=0.0, bottom_fraction=0.745)
add_shot(doc, "demo-3-roster.png", "On a laptop: Download roster and Upload attendance, top right.", width_in=6.0)

doc.add_heading("4. Back online: upload who attended (organizers)", level=1)
doc.add_paragraph("Open Upload (or Check-ins, then Upload attendance).", style="List Number")
doc.add_paragraph("Choose the event day the list is for. One list per day.", style="List Number")
doc.add_paragraph("Paste the emails, or choose the CSV file. In a roster file, only rows marked Y, yes, x or 1 are counted.", style="List Number")
doc.add_paragraph("Tap Preview. Check the numbers: ready to check in, already checked in, not on the guest list, inactive. Fix any email that was not matched.", style="List Number")
doc.add_paragraph("Tap Save attendance. It is safe to upload the same file twice. Nobody is counted twice.", style="List Number")
add_shot(doc, "mobile-3-upload-filled.png", "On a phone: paste the list, Preview, then Save attendance.", left_fraction=214 / 1024, width_in=2.4, top_fraction=0.0, bottom_fraction=0.745)
add_shot(doc, "demo-4-upload-filled.png", "On a laptop: choose the day, paste or load the list, then Preview.", width_in=6.0)

doc.add_heading("Before the event", level=1)
for text in [
    "Every scanner signs in the day before and completes one test scan.",
    "Charge phones and bring power banks and a venue hotspot.",
    "Download and print the roster each morning.",
    "Keep at least two organizer accounts signed in.",
]:
    doc.add_paragraph(text, style="List Bullet")

doc.add_heading("End of each day", level=1)
for text in [
    "Open each scanner phone and check the pending count is zero.",
    "Clear anything under Needs review.",
    "Download the roster again and save it as that day's record.",
]:
    doc.add_paragraph(text, style="List Bullet")

doc.add_heading("Who to call", level=1)
doc.add_paragraph("Add the organizer names and phone numbers here.")

doc.save(OUT)
print("saved", OUT)
