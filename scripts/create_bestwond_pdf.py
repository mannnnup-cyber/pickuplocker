from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.lib.units import inch
import os

# Register fonts
pdfmetrics.registerFont(TTFont('Times New Roman', '/usr/share/fonts/truetype/english/Times-New-Roman.ttf'))
registerFontFamily('Times New Roman', normal='Times New Roman', bold='Times New Roman')

# Create document
output_path = '/home/z/my-project/download/Bestwond_API_Error_Report.pdf'
os.makedirs(os.path.dirname(output_path), exist_ok=True)

doc = SimpleDocTemplate(
    output_path,
    pagesize=letter,
    title='Bestwond API Error Report',
    author='Z.ai',
    creator='Z.ai',
    subject='Device linking issue - uqkey error'
)

# Styles
styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    name='Title',
    fontName='Times New Roman',
    fontSize=18,
    alignment=TA_CENTER,
    spaceAfter=24,
    textColor=colors.HexColor('#1F4E79')
)

heading_style = ParagraphStyle(
    name='Heading',
    fontName='Times New Roman',
    fontSize=14,
    alignment=TA_LEFT,
    spaceBefore=18,
    spaceAfter=12,
    textColor=colors.HexColor('#1F4E79')
)

body_style = ParagraphStyle(
    name='Body',
    fontName='Times New Roman',
    fontSize=11,
    alignment=TA_LEFT,
    spaceAfter=8,
    leading=16
)

code_style = ParagraphStyle(
    name='Code',
    fontName='Times New Roman',
    fontSize=10,
    alignment=TA_LEFT,
    leftIndent=20,
    spaceAfter=8,
    backColor=colors.HexColor('#F5F5F5')
)

error_style = ParagraphStyle(
    name='Error',
    fontName='Times New Roman',
    fontSize=11,
    alignment=TA_LEFT,
    textColor=colors.HexColor('#CC0000'),
    spaceAfter=8
)

story = []

# Title
story.append(Paragraph('<b>BESTWOND API ERROR REPORT</b>', title_style))
story.append(Paragraph('Device Linking Issue - uqkey Error', ParagraphStyle(
    name='Subtitle', fontName='Times New Roman', fontSize=14, alignment=TA_CENTER, spaceAfter=30
)))
story.append(Spacer(1, 24))

# Account Information
story.append(Paragraph('<b>ACCOUNT INFORMATION</b>', heading_style))

account_data = [
    [Paragraph('<b>Field</b>', body_style), Paragraph('<b>Value</b>', body_style)],
    [Paragraph('App ID', body_style), Paragraph('bw_86b83996147111f', body_style)],
    [Paragraph('App Secret', body_style), Paragraph('86b83aa4147111f18bd500163e198b20', body_style)],
    [Paragraph('Device Number', body_style), Paragraph('2100018247', body_style)],
]

account_table = Table(account_data, colWidths=[2*inch, 4*inch])
account_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4E79')),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('BACKGROUND', (0, 1), (-1, -1), colors.white),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ('LEFTPADDING', (0, 0), (-1, -1), 10),
    ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ('TOPPADDING', (0, 0), (-1, -1), 8),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
]))
story.append(account_table)
story.append(Spacer(1, 18))

# API Endpoint
story.append(Paragraph('<b>API ENDPOINT</b>', heading_style))
story.append(Paragraph('POST https://api.bestwond.com/api/iot/open/box/', body_style))
story.append(Spacer(1, 18))

# Request Parameters
story.append(Paragraph('<b>REQUEST PARAMETERS (JSON Body)</b>', heading_style))

params_data = [
    [Paragraph('<b>Parameter</b>', body_style), Paragraph('<b>Value</b>', body_style), Paragraph('<b>Description</b>', body_style)],
    [Paragraph('app_id', body_style), Paragraph('bw_86b83996147111f', body_style), Paragraph('Application ID', body_style)],
    [Paragraph('timestamps', body_style), Paragraph('1775088594', body_style), Paragraph('Unix timestamp (seconds)', body_style)],
    [Paragraph('device_number', body_style), Paragraph('2100018247', body_style), Paragraph('Device ID', body_style)],
    [Paragraph('lock_address', body_style), Paragraph('0103', body_style), Paragraph('Box address (Box 3)', body_style)],
    [Paragraph('use_type', body_style), Paragraph('S', body_style), Paragraph('Single open mode', body_style)],
]

params_table = Table(params_data, colWidths=[1.5*inch, 2.5*inch, 2*inch])
params_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4E79')),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('BACKGROUND', (0, 1), (-1, -1), colors.white),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ('TOPPADDING', (0, 0), (-1, -1), 6),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
]))
story.append(params_table)
story.append(Spacer(1, 18))

# Signature Generation
story.append(Paragraph('<b>SIGNATURE GENERATION</b>', heading_style))
story.append(Paragraph('Method: SHA512(sorted_url_params + app_secret)', body_style))
story.append(Paragraph('The signature is appended to the URL as ?sign=HASH', body_style))
story.append(Spacer(1, 18))

# API Response
story.append(Paragraph('<b>API RESPONSE</b>', heading_style))

response_data = [
    [Paragraph('<b>Field</b>', body_style), Paragraph('<b>Value</b>', body_style)],
    [Paragraph('HTTP Status', body_style), Paragraph('200 OK', body_style)],
    [Paragraph('Response Code', body_style), Paragraph('0 (Operation successful)', body_style)],
    [Paragraph('device.status', body_style), Paragraph('fail', body_style)],
    [Paragraph('device.msg', body_style), Paragraph('The device uqkey is error, Please ask seller!', body_style)],
]

response_table = Table(response_data, colWidths=[2*inch, 4*inch])
response_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4E79')),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('BACKGROUND', (0, 1), (-1, -1), colors.white),
    ('BACKGROUND', (0, 4), (-1, 4), colors.HexColor('#FFEEEE')),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ('LEFTPADDING', (0, 0), (-1, -1), 10),
    ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ('TOPPADDING', (0, 0), (-1, -1), 8),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
]))
story.append(response_table)
story.append(Spacer(1, 18))

# Error Message
story.append(Paragraph('<b>ERROR MESSAGE</b>', heading_style))
story.append(Paragraph('<b>"The device uqkey is error, Please ask seller!"</b>', error_style))
story.append(Spacer(1, 12))

# Issue Summary
story.append(Paragraph('<b>ISSUE SUMMARY</b>', heading_style))
story.append(Paragraph('The API returns "uqkey error" which indicates that the device is not properly linked to this app account.', body_style))
story.append(Spacer(1, 8))
story.append(Paragraph('<b>REQUEST:</b> Please link device <b>2100018247</b> to app account <b>bw_86b83996147111f</b> so we can control the locker boxes via API.', body_style))

# Build PDF
doc.build(story)
print(f"PDF created: {output_path}")
