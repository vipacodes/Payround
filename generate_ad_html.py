import base64
import json

audio_files = {
    'full': 'public/ads/payround_full_vo.mp3',
    'scene1': 'public/ads/payround_scene1.mp3',
    'scene2': 'public/ads/payround_scene2.mp3',
    'scene3': 'public/ads/payround_scene3.mp3',
    'scene4': 'public/ads/payround_scene4.mp3',
}

audio_b64 = {}
for k, path in audio_files.items():
    with open(path, 'rb') as f:
        audio_b64[k] = 'data:audio/mp3;base64,' + base64.b64encode(f.read()).decode('utf-8')

html_content = f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Payround — High-Impact Motion Graphics Advertisement</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
  <style>
    :root {{
      --primary: #16a34a;
      --primary-light: #22c55e;
      --primary-dark: #15803d;
      --primary-glow: rgba(34, 197, 94, 0.4);
      --bg: #07090e;
      --card-bg: rgba(18, 24, 38, 0.85);
      --card-border: rgba(255, 255, 255, 0.08);
      --gold: #f59e0b;
      --gold-glow: rgba(245, 158, 11, 0.4);
      --text: #f8fafc;
      --text-muted: #94a3b8;
    }}

    * {{
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      user-select: none;
      -webkit-font-smoothing: antialiased;
    }}

    body {{
      background-color: var(--bg);
      color: var(--text);
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      perspective: 1200px;
    }}

    /* Ambient animated backdrop */
    .ambient-canvas {{
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 0;
    }}

    .glow-orb {{
      position: fixed;
      border-radius: 50%;
      filter: blur(120px);
      pointer-events: none;
      z-index: 0;
      opacity: 0.45;
      animation: floatOrb 12s ease-in-out infinite alternate;
    }}

    .glow-orb-1 {{
      top: -10%;
      left: 15%;
      width: 500px;
      height: 500px;
      background: radial-gradient(circle, #16a34a 0%, transparent 70%);
    }}

    .glow-orb-2 {{
      bottom: -10%;
      right: 10%;
      width: 600px;
      height: 600px;
      background: radial-gradient(circle, #0284c7 0%, transparent 70%);
      animation-delay: -6s;
    }}

    @keyframes floatOrb {{
      0% {{ transform: translate(0, 0) scale(1); }}
      50% {{ transform: translate(40px, 60px) scale(1.15); }}
      100% {{ transform: translate(-30px, -40px) scale(0.95); }}
    }}

    /* Main Container */
    .ad-stage {{
      position: relative;
      z-index: 10;
      width: 100%;
      max-width: 1200px;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      padding: 24px 20px;
      gap: 20px;
    }}

    /* Header Bar */
    .top-header {{
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 24px;
      background: rgba(15, 23, 42, 0.7);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 20px;
      box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.5);
    }}

    .brand-pill {{
      display: flex;
      align-items: center;
      gap: 12px;
    }}

    .brand-logo-icon {{
      width: 38px;
      height: 38px;
      background: linear-gradient(135deg, #22c55e, #15803d);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: 20px;
      color: #fff;
      box-shadow: 0 4px 15px var(--primary-glow);
    }}

    .brand-text h1 {{
      font-size: 1.1rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 6px;
    }}

    .brand-text p {{
      font-size: 0.75rem;
      color: var(--text-muted);
      font-weight: 500;
    }}

    .header-badge {{
      background: rgba(34, 197, 94, 0.12);
      border: 1px solid rgba(34, 197, 94, 0.3);
      color: #4ade80;
      padding: 6px 14px;
      border-radius: 30px;
      font-size: 0.78rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 6px;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }}

    .live-dot {{
      width: 8px;
      height: 8px;
      background: #22c55e;
      border-radius: 50%;
      box-shadow: 0 0 10px #22c55e;
      animation: pulseDot 1.5s infinite;
    }}

    @keyframes pulseDot {{
      0%, 100% {{ transform: scale(1); opacity: 1; }}
      50% {{ transform: scale(1.4); opacity: 0.6; }}
    }}

    /* Main Showcase Area */
    .showcase-grid {{
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      gap: 40px;
      width: 100%;
      align-items: center;
      justify-content: center;
      margin: auto 0;
    }}

    @media (max-width: 900px) {{
      .showcase-grid {{
        grid-template-columns: 1fr;
        gap: 30px;
      }}
    }}

    /* 3D Phone Mockup Container */
    .phone-viewport {{
      position: relative;
      display: flex;
      justify-content: center;
      align-items: center;
      transform-style: preserve-3d;
      transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    }}

    .phone-case {{
      position: relative;
      width: 360px;
      height: 680px;
      background: #0d111c;
      border-radius: 50px;
      padding: 12px;
      box-shadow: 
        0 0 0 2px rgba(255, 255, 255, 0.12),
        0 25px 60px -15px rgba(0, 0, 0, 0.9),
        0 0 50px -10px var(--primary-glow);
      border: 4px solid #1e293b;
      transform-style: preserve-3d;
      transition: all 0.7s cubic-bezier(0.2, 0.8, 0.2, 1);
    }}

    /* Dynamic screen glare reflection */
    .phone-case::after {{
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      border-radius: 46px;
      background: linear-gradient(125deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.02) 40%, transparent 60%);
      pointer-events: none;
      z-index: 100;
    }}

    .phone-screen {{
      width: 100%;
      height: 100%;
      background: #090e1a;
      border-radius: 40px;
      overflow: hidden;
      position: relative;
      display: flex;
      flex-direction: column;
      border: 1px solid rgba(255, 255, 255, 0.06);
    }}

    /* Dynamic Island */
    .dynamic-island {{
      position: absolute;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      width: 110px;
      height: 28px;
      background: #000;
      border-radius: 20px;
      z-index: 90;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 10px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      transition: all 0.4s ease;
    }}

    .camera-lens {{
      width: 10px;
      height: 10px;
      background: #111827;
      border-radius: 50%;
      box-shadow: inset 0 0 3px #38bdf8;
    }}

    .sensor-dot {{
      width: 6px;
      height: 6px;
      background: #047857;
      border-radius: 50%;
      opacity: 0.8;
    }}

    /* App Header inside phone */
    .app-topbar {{
      padding: 46px 16px 12px;
      background: rgba(13, 17, 28, 0.95);
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }}

    .app-brand {{
      display: flex;
      align-items: center;
      gap: 8px;
    }}

    .app-brand-badge {{
      width: 28px;
      height: 28px;
      background: #16a34a;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 14px;
      color: #fff;
    }}

    .app-brand-title {{
      font-size: 0.95rem;
      font-weight: 800;
      color: #fff;
      letter-spacing: -0.02em;
    }}

    .app-user-avatar {{
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 2px solid #22c55e;
      background: #1e293b;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 700;
      color: #22c55e;
      position: relative;
    }}

    .app-user-avatar::after {{
      content: '✓';
      position: absolute;
      bottom: -3px;
      right: -3px;
      width: 13px;
      height: 13px;
      background: #2563eb;
      color: #fff;
      font-size: 9px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      border: 1px solid #090e1a;
    }}

    /* Scene Viewport inside Phone */
    .app-viewport {{
      flex: 1;
      padding: 14px;
      overflow-y: auto;
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }}

    .app-viewport::-webkit-scrollbar {{
      display: none;
    }}

    /* SCENE 1: Manual Chaos Mockup */
    .scene-view {{
      position: absolute;
      top: 14px;
      left: 14px;
      right: 14px;
      bottom: 14px;
      opacity: 0;
      transform: translateY(20px) scale(0.96);
      transition: all 0.5s cubic-bezier(0.2, 0.9, 0.3, 1);
      pointer-events: none;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }}

    .scene-view.active {{
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }}

    /* Scene 1: Chaos Styles */
    .chaos-container {{
      display: flex;
      flex-direction: column;
      gap: 10px;
      height: 100%;
    }}

    .chaos-warning-banner {{
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
      padding: 10px 12px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      gap: 10px;
      color: #fca5a5;
      font-size: 0.8rem;
      font-weight: 600;
    }}

    .chat-bubble {{
      padding: 10px 14px;
      border-radius: 16px;
      font-size: 0.78rem;
      line-height: 1.35;
      max-width: 85%;
      animation: popMessage 0.4s ease-out;
    }}

    .chat-bubble.incoming {{
      background: #1e293b;
      color: #e2e8f0;
      align-self: flex-start;
      border-bottom-left-radius: 4px;
    }}

    .chat-bubble.outgoing {{
      background: #991b1b;
      color: #fee2e2;
      align-self: flex-end;
      border-bottom-right-radius: 4px;
    }}

    .chat-bubble.panic {{
      background: rgba(220, 38, 38, 0.25);
      border: 1px solid rgba(220, 38, 38, 0.4);
      color: #fca5a5;
      align-self: center;
      text-align: center;
      width: 100%;
      max-width: 100%;
      border-radius: 12px;
    }}

    @keyframes popMessage {{
      0% {{ opacity: 0; transform: translateY(10px) scale(0.9); }}
      100% {{ opacity: 1; transform: translateY(0) scale(1); }}
    }}

    /* Scene 2: Payround Discovery */
    .custody-disclaimer {{
      background: linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(59, 130, 246, 0.15));
      border: 1px solid rgba(34, 197, 94, 0.3);
      border-radius: 14px;
      padding: 10px 12px;
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }}

    .custody-disclaimer-icon {{
      font-size: 18px;
    }}

    .custody-disclaimer-text h4 {{
      font-size: 0.8rem;
      font-weight: 800;
      color: #4ade80;
      margin-bottom: 2px;
    }}

    .custody-disclaimer-text p {{
      font-size: 0.7rem;
      color: #cbd5e1;
      line-height: 1.25;
    }}

    /* Authentic Payround Group Card */
    .payround-group-card {{
      background: rgba(30, 41, 59, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 18px;
      padding: 14px;
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
      position: relative;
      overflow: hidden;
    }}

    .card-top-row {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }}

    .group-avatar-box {{
      display: flex;
      align-items: center;
      gap: 10px;
    }}

    .group-icon-initial {{
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, #15803d, #166534);
      color: #4ade80;
      font-weight: 800;
      font-size: 16px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(74, 222, 128, 0.3);
    }}

    .group-info-name {{
      font-size: 0.85rem;
      font-weight: 700;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 4px;
    }}

    .group-id-tag {{
      font-size: 0.68rem;
      color: var(--text-muted);
      font-family: monospace;
    }}

    .badge-tier-gold {{
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #fff;
      font-size: 0.65rem;
      font-weight: 800;
      padding: 3px 8px;
      border-radius: 20px;
      display: flex;
      align-items: center;
      gap: 3px;
      box-shadow: 0 2px 8px var(--gold-glow);
    }}

    .group-metrics-grid {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 10px;
      background: rgba(15, 23, 42, 0.6);
      padding: 10px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.04);
    }}

    .metric-item {{
      display: flex;
      flex-direction: column;
      gap: 2px;
    }}

    .metric-label {{
      font-size: 0.65rem;
      color: var(--text-muted);
    }}

    .metric-value {{
      font-size: 0.78rem;
      font-weight: 800;
      color: #f1f5f9;
    }}

    .metric-value.highlight {{
      color: #4ade80;
    }}

    /* Scene 3: Verification & Direct Receipt */
    .kyc-verification-box {{
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(34, 197, 94, 0.3);
      border-radius: 16px;
      padding: 12px;
      display: flex;
      align-items: center;
      gap: 12px;
    }}

    .kyc-avatar-wrapper {{
      position: relative;
    }}

    .kyc-avatar-img {{
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: linear-gradient(135deg, #3b82f6, #1d4ed8);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      border: 2px solid #22c55e;
    }}

    .kyc-details h4 {{
      font-size: 0.82rem;
      font-weight: 800;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 5px;
    }}

    .kyc-status-chip {{
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: rgba(34, 197, 94, 0.15);
      color: #4ade80;
      font-size: 0.68rem;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 10px;
      margin-top: 4px;
    }}

    .receipt-upload-card {{
      background: rgba(30, 41, 59, 0.7);
      border: 1px dashed rgba(34, 197, 94, 0.4);
      border-radius: 16px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }}

    .receipt-preview {{
      background: #0f172a;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 10px;
      display: flex;
      align-items: center;
      gap: 10px;
    }}

    .receipt-thumb {{
      width: 40px;
      height: 48px;
      background: #1e293b;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
    }}

    .receipt-meta {{
      flex: 1;
    }}

    .receipt-meta h5 {{
      font-size: 0.75rem;
      font-weight: 700;
      color: #fff;
    }}

    .receipt-meta p {{
      font-size: 0.65rem;
      color: var(--text-muted);
    }}

    .receipt-tag-approved {{
      background: #16a34a;
      color: #fff;
      font-size: 0.65rem;
      font-weight: 800;
      padding: 3px 8px;
      border-radius: 6px;
      display: inline-block;
      margin-top: 4px;
    }}

    .reminder-alert-pill {{
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: #fbbf24;
      padding: 8px 12px;
      border-radius: 12px;
      font-size: 0.72rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }}

    /* Scene 4: Authentic Rotation Table */
    .rotation-container {{
      display: flex;
      flex-direction: column;
      gap: 8px;
    }}

    .rotation-card-item {{
      background: rgba(30, 41, 59, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      padding: 10px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: all 0.3s ease;
    }}

    .rotation-card-item.received {{
      background: rgba(22, 101, 52, 0.3);
      border-color: rgba(34, 197, 94, 0.4);
    }}

    .rotation-card-item.next {{
      background: rgba(34, 197, 94, 0.2);
      border-color: #22c55e;
      box-shadow: 0 0 15px rgba(34, 197, 94, 0.25);
      transform: scale(1.02);
    }}

    .rotation-left {{
      display: flex;
      align-items: center;
      gap: 10px;
    }}

    .rotation-order-number {{
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: #1e293b;
      color: #94a3b8;
      font-weight: 800;
      font-size: 0.75rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }}

    .rotation-card-item.received .rotation-order-number {{
      background: #16a34a;
      color: #fff;
    }}

    .rotation-card-item.next .rotation-order-number {{
      background: #22c55e;
      color: #052e16;
    }}

    .rotation-member-name {{
      font-size: 0.78rem;
      font-weight: 700;
      color: #fff;
    }}

    .rotation-status-badge {{
      font-size: 0.65rem;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 20px;
      display: flex;
      align-items: center;
      gap: 4px;
    }}

    .status-badge-received {{
      background: rgba(34, 197, 94, 0.2);
      color: #4ade80;
    }}

    .status-badge-next {{
      background: #22c55e;
      color: #052e16;
      font-weight: 900;
      animation: pulseGlow 1.5s infinite;
    }}

    @keyframes pulseGlow {{
      0%, 100% {{ box-shadow: 0 0 8px #22c55e; }}
      50% {{ box-shadow: 0 0 18px #4ade80; }}
    }}

    .status-badge-waiting {{
      background: rgba(148, 163, 184, 0.15);
      color: #94a3b8;
    }}

    /* Scene 5: 4 Steps Pipeline & CTA */
    .steps-pipeline-list {{
      display: flex;
      flex-direction: column;
      gap: 8px;
    }}

    .step-pipeline-item {{
      background: rgba(15, 23, 42, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 8px 12px;
      display: flex;
      align-items: center;
      gap: 10px;
    }}

    .step-bubble {{
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #16a34a;
      color: #fff;
      font-weight: 800;
      font-size: 0.72rem;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }}

    .step-text h5 {{
      font-size: 0.75rem;
      font-weight: 700;
      color: #fff;
    }}

    .step-text p {{
      font-size: 0.65rem;
      color: var(--text-muted);
    }}

    .cta-final-button {{
      width: 100%;
      background: linear-gradient(135deg, #22c55e, #15803d);
      color: #fff;
      border: none;
      padding: 12px;
      border-radius: 14px;
      font-weight: 800;
      font-size: 0.85rem;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
      box-shadow: 0 10px 25px var(--primary-glow);
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }}

    /* Right Column: Kinetic Typography & Storyboard */
    .narrative-panel {{
      display: flex;
      flex-direction: column;
      gap: 20px;
      justify-content: center;
    }}

    .kinetic-badge-tag {{
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(34, 197, 94, 0.12);
      border: 1px solid rgba(34, 197, 94, 0.3);
      padding: 6px 14px;
      border-radius: 30px;
      font-size: 0.82rem;
      font-weight: 700;
      color: #4ade80;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      align-self: flex-start;
    }}

    .kinetic-headline {{
      font-family: 'Space Grotesk', sans-serif;
      font-size: 2.7rem;
      font-weight: 700;
      line-height: 1.1;
      letter-spacing: -0.03em;
      color: #fff;
      min-height: 120px;
      transition: all 0.3s ease;
    }}

    .kinetic-headline .highlight-green {{
      color: #22c55e;
      text-shadow: 0 0 30px var(--primary-glow);
    }}

    .kinetic-headline .highlight-gold {{
      color: #fbbf24;
      text-shadow: 0 0 30px var(--gold-glow);
    }}

    .kinetic-subtext {{
      font-size: 1.1rem;
      color: #94a3b8;
      line-height: 1.6;
      font-weight: 500;
      min-height: 60px;
    }}

    /* Features Grid under Narrative */
    .features-pill-row {{
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }}

    .feature-pill {{
      background: rgba(30, 41, 59, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 8px 14px;
      border-radius: 12px;
      font-size: 0.82rem;
      font-weight: 600;
      color: #cbd5e1;
      display: flex;
      align-items: center;
      gap: 6px;
    }}

    .feature-pill span.icon {{
      color: #22c55e;
    }}

    /* Floating CTA in Right Panel */
    .narrative-cta-box {{
      background: linear-gradient(135deg, rgba(22, 101, 52, 0.25), rgba(15, 23, 42, 0.7));
      border: 1px solid rgba(34, 197, 94, 0.3);
      padding: 18px 22px;
      border-radius: 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }}

    .cta-text h4 {{
      font-size: 0.95rem;
      font-weight: 800;
      color: #fff;
    }}

    .cta-text p {{
      font-size: 0.8rem;
      color: var(--text-muted);
    }}

    .visit-link-btn {{
      background: #22c55e;
      color: #052e16;
      font-weight: 800;
      font-size: 0.85rem;
      padding: 10px 18px;
      border-radius: 12px;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 4px 15px var(--primary-glow);
      transition: transform 0.2s ease;
      white-space: nowrap;
    }}

    .visit-link-btn:hover {{
      transform: scale(1.05);
    }}

    /* Bottom Video Controller */
    .bottom-studio-bar {{
      width: 100%;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(25px);
      -webkit-backdrop-filter: blur(25px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 24px;
      padding: 16px 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
    }}

    /* Timeline scrubber */
    .timeline-track-wrapper {{
      display: flex;
      align-items: center;
      gap: 14px;
    }}

    .time-readout {{
      font-family: monospace;
      font-size: 0.82rem;
      font-weight: 700;
      color: #94a3b8;
      width: 45px;
    }}

    .timeline-slider-bar {{
      flex: 1;
      height: 8px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      position: relative;
      cursor: pointer;
      overflow: hidden;
    }}

    .timeline-progress-fill {{
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #16a34a, #22c55e, #4ade80);
      border-radius: 10px;
      box-shadow: 0 0 10px #22c55e;
      transition: width 0.1s linear;
    }}

    /* Controls row */
    .controls-row {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      flex-wrap: wrap;
    }}

    .playback-buttons {{
      display: flex;
      align-items: center;
      gap: 12px;
    }}

    .btn-ctrl {{
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #fff;
      width: 42px;
      height: 42px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      cursor: pointer;
      transition: all 0.2s ease;
    }}

    .btn-ctrl:hover {{
      background: rgba(255, 255, 255, 0.18);
      transform: translateY(-2px);
    }}

    .btn-ctrl.btn-primary-play {{
      background: #22c55e;
      color: #052e16;
      font-weight: 900;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      box-shadow: 0 4px 15px var(--primary-glow);
    }}

    .scene-navigator {{
      display: flex;
      align-items: center;
      gap: 8px;
    }}

    .scene-nav-btn {{
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #94a3b8;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s ease;
    }}

    .scene-nav-btn.active {{
      background: rgba(34, 197, 94, 0.2);
      border-color: #22c55e;
      color: #4ade80;
    }}

    .audio-switches {{
      display: flex;
      align-items: center;
      gap: 10px;
    }}

    .sound-toggle-btn {{
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #cbd5e1;
      padding: 6px 14px;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
    }}
  </style>
</head>
<body>

  <!-- Ambient background glow effects -->
  <div class="glow-orb glow-orb-1"></div>
  <div class="glow-orb glow-orb-2"></div>
  <canvas class="ambient-canvas" id="ambientCanvas"></canvas>

  <div class="ad-stage">
    
    <!-- Top Brand Header -->
    <header class="top-header">
      <div class="brand-pill">
        <div class="brand-logo-icon">P</div>
        <div class="brand-text">
          <h1>Payround <span style="color:#22c55e;">Ads Studio</span></h1>
          <p>Nigeria's Trusted Rotational Savings Platform</p>
        </div>
      </div>
      <div class="header-badge">
        <div class="live-dot"></div>
        Spec Motion Ad Preview
      </div>
    </header>

    <!-- Main Motion Graphics Showcase Grid -->
    <main class="showcase-grid">

      <!-- Left Column: 3D Animated Smartphone Interface -->
      <div class="phone-viewport" id="phoneViewport">
        <div class="phone-case" id="phoneCase">
          
          <div class="dynamic-island">
            <div class="camera-lens"></div>
            <div class="sensor-dot"></div>
          </div>

          <div class="phone-screen">
            
            <!-- App Bar inside Phone -->
            <div class="app-topbar">
              <div class="app-brand">
                <div class="app-brand-badge">P</div>
                <div class="app-brand-title">Payround</div>
              </div>
              <div class="app-user-avatar">BJ</div>
            </div>

            <!-- Scene Switcher Container inside Phone -->
            <div class="app-viewport">
              
              <!-- SCENE 1: The Problem (Messy Manual Ajo / WhatsApp defaults) -->
              <div class="scene-view active" id="scene1">
                <div class="chaos-container">
                  <div class="chaos-warning-banner">
                    <span style="font-size:18px;">⚠️</span>
                    <div>
                      <strong>Manual Savings Risks:</strong>
                      <div style="font-size:0.7rem; color:#fca5a5;">Lost money, skipped turns & defaults</div>
                    </div>
                  </div>

                  <div class="chat-bubble incoming">
                    <strong>WhatsApp Savings Group (12 Members)</strong><br/>
                    "Who is paying for this month's round? Admin is not picking calls!"
                  </div>

                  <div class="chat-bubble outgoing">
                    "I paid since yesterday but nobody recorded it on the paper!"
                  </div>

                  <div class="chat-bubble panic">
                    ❌ <strong>DISPUTE ALERT</strong><br/>
                    "Member defaulted! Payout delayed indefinitely."
                  </div>

                  <div style="margin-top:auto; text-align:center; padding:12px; background:rgba(239,68,68,0.1); border-radius:14px; border:1px solid rgba(239,68,68,0.2);">
                    <div style="font-size:0.75rem; color:#f87171; font-weight:800;">STOP THE CONFUSION</div>
                    <div style="font-size:0.68rem; color:#cbd5e1; margin-top:2px;">There's a smarter, safer way to save together.</div>
                  </div>
                </div>
              </div>

              <!-- SCENE 2: The Solution (Meet Payround & No Custody Model) -->
              <div class="scene-view" id="scene2">
                <!-- Custody Transparency Notice -->
                <div class="custody-disclaimer">
                  <span class="custody-disclaimer-icon">🛡️</span>
                  <div class="custody-disclaimer-text">
                    <h4>Direct & Transparent</h4>
                    <p>Payround does <strong>NOT</strong> hold user savings. Members transfer directly to Group Admin.</p>
                  </div>
                </div>

                <!-- Verified Group Card #1 -->
                <div class="payround-group-card">
                  <div class="card-top-row">
                    <div class="group-avatar-box">
                      <div class="group-icon-initial">L</div>
                      <div>
                        <div class="group-info-name">
                          Lekki Business Circle
                          <span style="color:#38bdf8;">✓</span>
                        </div>
                        <div class="group-id-tag">ID: GRP-77291</div>
                      </div>
                    </div>
                    <div class="badge-tier-gold">★ Tier 3 Gold</div>
                  </div>

                  <div class="group-metrics-grid">
                    <div class="metric-item">
                      <span class="metric-label">Contribution</span>
                      <span class="metric-value highlight">₦100,000</span>
                    </div>
                    <div class="metric-item">
                      <span class="metric-label">Schedule</span>
                      <span class="metric-value">Monthly</span>
                    </div>
                    <div class="metric-item">
                      <span class="metric-label">Members</span>
                      <span class="metric-value">10 / 10 Active</span>
                    </div>
                    <div class="metric-item">
                      <span class="metric-label">Health Score</span>
                      <span class="metric-value highlight">99% Trust</span>
                    </div>
                  </div>
                </div>

                <!-- Verified Group Card #2 -->
                <div class="payround-group-card" style="opacity:0.85;">
                  <div class="card-top-row">
                    <div class="group-avatar-box">
                      <div class="group-icon-initial" style="background:#1e40af; color:#93c5fd;">A</div>
                      <div>
                        <div class="group-info-name">Abuja Tech Savers <span style="color:#38bdf8;">✓</span></div>
                        <div class="group-id-tag">ID: GRP-88310</div>
                      </div>
                    </div>
                    <div class="badge-tier-gold" style="background:#3b82f6;">★ Tier 2</div>
                  </div>
                  <div style="font-size:0.72rem; color:#cbd5e1; display:flex; justify-content:space-between; margin-top:6px;">
                    <span>₦50,000 / Bi-weekly</span>
                    <span style="color:#4ade80; font-weight:700;">8/10 Joined</span>
                  </div>
                </div>
              </div>

              <!-- SCENE 3: Identity Verification & Direct Receipts -->
              <div class="scene-view" id="scene3">
                <div class="kyc-verification-box">
                  <div class="kyc-avatar-wrapper">
                    <div class="kyc-avatar-img">👤</div>
                  </div>
                  <div class="kyc-details">
                    <h4>Chioma Okonkwo <span style="color:#38bdf8; font-size:12px;">✓ Verified</span></h4>
                    <span class="kyc-status-chip">✓ NIN & Photo Verified</span>
                  </div>
                </div>

                <!-- Receipt Upload Section -->
                <div class="receipt-upload-card">
                  <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:0.75rem; font-weight:800; color:#fff;">Proof of Payment</span>
                    <span style="font-size:0.65rem; color:#4ade80; font-weight:700;">Bank Transfer Slip</span>
                  </div>

                  <div class="receipt-preview">
                    <div class="receipt-thumb">📄</div>
                    <div class="receipt-meta">
                      <h5>Palmpay Transfer: ₦100,000</h5>
                      <p>To: Basikoro James (Group Admin)</p>
                      <span class="receipt-tag-approved">✓ Confirmed by Admin</span>
                    </div>
                  </div>
                </div>

                <!-- Smart Reminder Pill -->
                <div class="reminder-alert-pill">
                  <span>⏰</span>
                  <div>
                    <strong>Smart Reminder:</strong>
                    <div>Payout Round #4 begins in 24 hours</div>
                  </div>
                </div>
              </div>

              <!-- SCENE 4: Transparent Rotation Table -->
              <div class="scene-view" id="scene4">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <span style="font-size:0.78rem; font-weight:800; color:#fff;">Live Rotation Queue</span>
                  <span style="font-size:0.68rem; color:#4ade80; font-weight:700;">Pool: ₦1,000,000</span>
                </div>

                <div class="rotation-container">
                  <!-- Turn 1 -->
                  <div class="rotation-card-item received">
                    <div class="rotation-left">
                      <div class="rotation-order-number">1</div>
                      <div>
                        <div class="rotation-member-name">Chioma Okonkwo</div>
                        <div style="font-size:0.62rem; color:#86efac;">Paid ₦100,000 • 1st Aug</div>
                      </div>
                    </div>
                    <div class="rotation-status-badge status-badge-received">✓ Received</div>
                  </div>

                  <!-- Turn 2 -->
                  <div class="rotation-card-item next">
                    <div class="rotation-left">
                      <div class="rotation-order-number">2</div>
                      <div>
                        <div class="rotation-member-name">Tunde Bakare</div>
                        <div style="font-size:0.62rem; color:#4ade80; font-weight:700;">Next Payout • 1st Sept</div>
                      </div>
                    </div>
                    <div class="rotation-status-badge status-badge-next">⚡ Next in Line</div>
                  </div>

                  <!-- Turn 3 -->
                  <div class="rotation-card-item">
                    <div class="rotation-left">
                      <div class="rotation-order-number">3</div>
                      <div>
                        <div class="rotation-member-name">Emeka Nnamdi</div>
                        <div style="font-size:0.62rem; color:#94a3b8;">Queue #3 • 1st Oct</div>
                      </div>
                    </div>
                    <div class="rotation-status-badge status-badge-waiting">⏳ Waiting</div>
                  </div>

                  <!-- Turn 4 -->
                  <div class="rotation-card-item" style="opacity:0.7;">
                    <div class="rotation-left">
                      <div class="rotation-order-number">4</div>
                      <div>
                        <div class="rotation-member-name">Zainab Aliyu</div>
                        <div style="font-size:0.62rem; color:#94a3b8;">Queue #4 • 1st Nov</div>
                      </div>
                    </div>
                    <div class="rotation-status-badge status-badge-waiting">⏳ Waiting</div>
                  </div>
                </div>

                <div style="background:rgba(15,23,42,0.8); padding:8px 12px; border-radius:12px; border:1px solid rgba(255,255,255,0.06); font-size:0.68rem; color:#cbd5e1; display:flex; justify-content:space-between;">
                  <span>Cycle Progress</span>
                  <span style="color:#4ade80; font-weight:800;">75% Completed</span>
                </div>
              </div>

              <!-- SCENE 5: 4 Easy Steps & Final CTA -->
              <div class="scene-view" id="scene5">
                <div style="text-align:center; margin-bottom:4px;">
                  <span style="font-size:0.75rem; font-weight:800; color:#4ade80; text-transform:uppercase;">How It Works</span>
                  <h4 style="font-size:0.9rem; font-weight:800; color:#fff;">4 Simple Steps</h4>
                </div>

                <div class="steps-pipeline-list">
                  <div class="step-pipeline-item">
                    <div class="step-bubble">1</div>
                    <div class="step-text">
                      <h5>Sign Up Free</h5>
                      <p>Create account with real photo</p>
                    </div>
                  </div>

                  <div class="step-pipeline-item">
                    <div class="step-bubble">2</div>
                    <div class="step-text">
                      <h5>Create or Join</h5>
                      <p>Start a group or join with Group ID</p>
                    </div>
                  </div>

                  <div class="step-pipeline-item">
                    <div class="step-bubble">3</div>
                    <div class="step-text">
                      <h5>Contribute Directly</h5>
                      <p>Pay Admin & upload proof receipt</p>
                    </div>
                  </div>

                  <div class="step-pipeline-item">
                    <div class="step-bubble">4</div>
                    <div class="step-text">
                      <h5>Track &amp; Get Paid</h5>
                      <p>Live payout queue, zero stories</p>
                    </div>
                  </div>
                </div>

                <button class="cta-final-button" onclick="window.open('https://payround-xi.vercel.app', '_blank')">
                  <span>🚀 Get Started Now</span>
                </button>
              </div>

            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: Kinetic Typography & Storyboard Copy -->
      <div class="narrative-panel">
        
        <div class="kinetic-badge-tag" id="sceneTag">
          <span>⚡ SCENE 01 / 05</span> • <span>THE HOOK</span>
        </div>

        <h2 class="kinetic-headline" id="kineticHeadline">
          Still managing rotational savings on <span class="highlight-green">paper or WhatsApp?</span>
        </h2>

        <p class="kinetic-subtext" id="kineticSubtext">
          Manual contributions lead to missed deadlines, lost records, and zero accountability. It is time for an upgrade.
        </p>

        <div class="features-pill-row">
          <div class="feature-pill"><span class="icon">🛡️</span> Zero Custody (Direct Transfers)</div>
          <div class="feature-pill"><span class="icon">✓</span> 100% Verified Profiles</div>
          <div class="feature-pill"><span class="icon">⚡</span> Automated Rotation Table</div>
          <div class="feature-pill"><span class="icon">📱</span> Smart WhatsApp Reminders</div>
        </div>

        <div class="narrative-cta-box">
          <div class="cta-text">
            <h4>Ready to organize your circle?</h4>
            <p>Join thousands of Nigerians saving with confidence.</p>
          </div>
          <a href="https://payround-xi.vercel.app" target="_blank" class="visit-link-btn">
            Open Payround ➔
          </a>
        </div>

      </div>

    </main>

    <!-- Bottom Studio Control Console -->
    <footer class="bottom-studio-bar">
      
      <!-- Progress Bar Track -->
      <div class="timeline-track-wrapper">
        <span class="time-readout" id="timeCurrent">00:00</span>
        <div class="timeline-slider-bar" id="timelineBar" onclick="seekVideo(event)">
          <div class="timeline-progress-fill" id="timelineFill"></div>
        </div>
        <span class="time-readout" id="timeTotal">00:30</span>
      </div>

      <!-- Control Buttons -->
      <div class="controls-row">
        
        <div class="playback-buttons">
          <button class="btn-ctrl btn-primary-play" id="playBtn" onclick="togglePlay()">▶</button>
          <button class="btn-ctrl" onclick="restartVideo()" title="Restart">↺</button>
          <button class="btn-ctrl" onclick="prevScene()" title="Previous Scene">⏮</button>
          <button class="btn-ctrl" onclick="nextScene()" title="Next Scene">⏭</button>
        </div>

        <!-- Scene Jump Buttons -->
        <div class="scene-navigator">
          <button class="scene-nav-btn active" onclick="jumpToScene(1)">1. The Hook</button>
          <button class="scene-nav-btn" onclick="jumpToScene(2)">2. Transparency</button>
          <button class="scene-nav-btn" onclick="jumpToScene(3)">3. Verification</button>
          <button class="scene-nav-btn" onclick="jumpToScene(4)">4. Rotation</button>
          <button class="scene-nav-btn" onclick="jumpToScene(5)">5. 4 Steps &amp; CTA</button>
        </div>

        <!-- Audio & Speed Settings -->
        <div class="audio-switches">
          <button class="sound-toggle-btn" id="audioToggleBtn" onclick="toggleAudioVoice()">
            <span id="audioIcon">🔊</span> Voiceover
          </button>
          <button class="sound-toggle-btn" id="sfxToggleBtn" onclick="toggleSfx()">
            <span>🎵</span> SFX &amp; Beat
          </button>
        </div>

      </div>

    </footer>

  </div>

  <!-- Audio Elements -->
  <audio id="fullAudio" preload="auto">
    <source src="{audio_b64['full']}" type="audio/mp3">
  </audio>

  <script>
    // Scene Data Configuration
    const SCENES = [
      {{
        id: 1,
        startTime: 0,
        endTime: 6.0,
        tag: '⚡ SCENE 01 / 05 • THE HOOK',
        headline: 'Still managing rotational savings on <span class="highlight-green">paper or WhatsApp?</span>',
        subtext: 'Manual contributions lead to missed deadlines, lost records, and zero accountability. It is time for an upgrade.',
        phoneTilt: 'rotateY(-12deg) rotateX(6deg) scale(0.98)',
      }},
      {{
        id: 2,
        startTime: 6.0,
        endTime: 13.5,
        tag: '🛡️ SCENE 02 / 05 • MEET PAYROUND',
        headline: 'Payround brings <span class="highlight-green">100% Transparency</span> to Rotational Savings',
        subtext: 'We never hold your money. Payround digitizes the system so members pay their group admin directly with full transparency.',
        phoneTilt: 'rotateY(0deg) rotateX(0deg) scale(1.05)',
      }},
      {{
        id: 3,
        startTime: 13.5,
        endTime: 20.5,
        tag: '🔐 SCENE 03 / 05 • IDENTITY & RECEIPTS',
        headline: 'Real <span class="highlight-green">Member Profiles</span> &amp; Verified Payment Proof',
        subtext: 'Know exactly who you are saving with. Upload direct transfer receipts with instant status confirmation and smart reminder alerts.',
        phoneTilt: 'rotateY(10deg) rotateX(4deg) scale(1.02)',
      }},
      {{
        id: 4,
        startTime: 20.5,
        endTime: 26.5,
        tag: '⚡ SCENE 04 / 05 • ROTATION SCHEDULE',
        headline: 'Automated <span class="highlight-gold">Payout Order</span> • Zero Confusion',
        subtext: 'Clear visibility of who has paid, who is next to receive, and the full payout queue in real time. You always know your turn.',
        phoneTilt: 'rotateY(-8deg) rotateX(5deg) scale(1.03)',
      }},
      {{
        id: 5,
        startTime: 26.5,
        endTime: 31.0,
        tag: '🚀 SCENE 05 / 05 • HOW IT WORKS & CTA',
        headline: 'Start Saving Smarter at <span class="highlight-green">payround-xi.vercel.app</span>',
        subtext: '1. Sign Up Free • 2. Create or Join • 3. Contribute Directly • 4. Track & Get Paid. Upgrade your rotational savings today!',
        phoneTilt: 'rotateY(0deg) rotateX(0deg) scale(1.06)',
      }}
    ];

    const TOTAL_DURATION = 31.0;
    let currentTime = 0;
    let isPlaying = false;
    let currentSceneIdx = 0;
    let voiceEnabled = true;
    let sfxEnabled = true;
    let animFrame = null;
    let lastTimestamp = null;

    const audioEl = document.getElementById('fullAudio');
    const phoneCase = document.getElementById('phoneCase');
    const timelineFill = document.getElementById('timelineFill');
    const timeCurrent = document.getElementById('timeCurrent');
    const timeTotal = document.getElementById('timeTotal');
    const playBtn = document.getElementById('playBtn');
    const sceneTag = document.getElementById('sceneTag');
    const kineticHeadline = document.getElementById('kineticHeadline');
    const kineticSubtext = document.getElementById('kineticSubtext');

    // Web Audio Synthesizer for SFX and Looping Beat
    let audioCtx = null;
    let beatInterval = null;

    function initAudioContext() {{
      if (!audioCtx) {{
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
      }}
      if (audioCtx.state === 'suspended') {{
        audioCtx.resume();
      }}
    }}

    function playSfx(type) {{
      if (!sfxEnabled) return;
      initAudioContext();
      if (!audioCtx) return;

      const now = audioCtx.currentTime;
      if (type === 'whoosh') {{
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.15);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.35);
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
      }} else if (type === 'chime') {{
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(880, now + 0.08); // A5
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.4);
      }} else if (type === 'chaching') {{
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc1.type = 'square';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(987.77, now);
        osc1.frequency.setValueAtTime(1318.51, now + 0.08);
        osc2.frequency.setValueAtTime(493.88, now);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(audioCtx.destination);
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.5);
        osc2.stop(now + 0.5);
      }}
    }}

    function startBackingBeat() {{
      if (beatInterval || !sfxEnabled) return;
      initAudioContext();
      let step = 0;
      beatInterval = setInterval(() => {{
        if (!isPlaying || !sfxEnabled || !audioCtx) return;
        const now = audioCtx.currentTime;
        // Kick on 0 and 2
        if (step % 2 === 0) {{
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.frequency.setValueAtTime(120, now);
          osc.frequency.exponentialRampToValueAtTime(40, now + 0.12);
          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(now);
          osc.stop(now + 0.15);
        }}
        // Hihat
        const bufferSize = audioCtx.sampleRate * 0.04;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {{
          data[i] = Math.random() * 2 - 1;
        }}
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 6000;
        const noiseGain = audioCtx.createGain();
        noiseGain.gain.setValueAtTime(0.03, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(audioCtx.destination);
        noise.start(now);

        step = (step + 1) % 4;
      }}, 250); // 120 BPM
    }}

    function stopBackingBeat() {{
      if (beatInterval) {{
        clearInterval(beatInterval);
        beatInterval = null;
      }}
    }}

    // Update UI for a given time
    function renderFrame(time) {{
      currentTime = Math.max(0, Math.min(TOTAL_DURATION, time));
      
      // Update Timeline
      const pct = (currentTime / TOTAL_DURATION) * 100;
      timelineFill.style.width = pct + '%';
      
      const mins = Math.floor(currentTime / 60);
      const secs = Math.floor(currentTime % 60);
      timeCurrent.textContent = String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');

      // Determine active scene
      let newSceneIdx = SCENES.findIndex(s => currentTime >= s.startTime && currentTime < s.endTime);
      if (newSceneIdx === -1) {{
        newSceneIdx = SCENES.length - 1;
      }}

      if (newSceneIdx !== currentSceneIdx) {{
        currentSceneIdx = newSceneIdx;
        applyScene(SCENES[currentSceneIdx]);
        playSfx('whoosh');
      }}
    }}

    function applyScene(scene) {{
      // Update phone screen views
      document.querySelectorAll('.scene-view').forEach((el, idx) => {{
        el.classList.toggle('active', idx === (scene.id - 1));
      }});

      // Update scene nav buttons
      document.querySelectorAll('.scene-nav-btn').forEach((btn, idx) => {{
        btn.classList.toggle('active', idx === (scene.id - 1));
      }});

      // 3D Phone tilt
      phoneCase.style.transform = scene.phoneTilt;

      // Update text
      sceneTag.innerHTML = scene.tag;
      kineticHeadline.innerHTML = scene.headline;
      kineticSubtext.innerHTML = scene.subtext;

      // Trigger scene specific SFX
      if (scene.id === 2 || scene.id === 3) playSfx('chime');
      if (scene.id === 4) playSfx('chaching');
    }}

    // Animation Loop
    function tick(timestamp) {{
      if (!lastTimestamp) lastTimestamp = timestamp;
      const delta = (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;

      if (isPlaying) {{
        currentTime += delta;
        if (currentTime >= TOTAL_DURATION) {{
          currentTime = TOTAL_DURATION;
          pauseVideo();
        }}
        renderFrame(currentTime);
      }}

      if (isPlaying) {{
        animFrame = requestAnimationFrame(tick);
      }}
    }}

    function togglePlay() {{
      initAudioContext();
      if (isPlaying) {{
        pauseVideo();
      }} else {{
        playVideo();
      }}
    }}

    function playVideo() {{
      if (currentTime >= TOTAL_DURATION) {{
        currentTime = 0;
      }}
      isPlaying = true;
      playBtn.textContent = '⏸';
      lastTimestamp = null;
      
      if (voiceEnabled) {{
        audioEl.currentTime = currentTime;
        audioEl.play().catch(e => console.log('Audio autoplay policy note:', e));
      }}
      
      startBackingBeat();
      animFrame = requestAnimationFrame(tick);
    }}

    function pauseVideo() {{
      isPlaying = false;
      playBtn.textContent = '▶';
      if (animFrame) cancelAnimationFrame(animFrame);
      audioEl.pause();
      stopBackingBeat();
    }}

    function restartVideo() {{
      currentTime = 0;
      renderFrame(0);
      if (voiceEnabled) {{
        audioEl.currentTime = 0;
      }}
      if (isPlaying) {{
        playVideo();
      }}
    }}

    function jumpToScene(sceneNum) {{
      const scene = SCENES[sceneNum - 1];
      if (scene) {{
        currentTime = scene.startTime;
        renderFrame(currentTime);
        if (voiceEnabled) {{
          audioEl.currentTime = currentTime;
        }}
      }}
    }}

    function nextScene() {{
      if (currentSceneIdx < SCENES.length - 1) {{
        jumpToScene(currentSceneIdx + 2);
      }}
    }}

    function prevScene() {{
      if (currentSceneIdx > 0) {{
        jumpToScene(currentSceneIdx);
      }}
    }}

    function seekVideo(e) {{
      const rect = timelineBar.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, clickX / rect.width));
      currentTime = pct * TOTAL_DURATION;
      renderFrame(currentTime);
      if (voiceEnabled) {{
        audioEl.currentTime = currentTime;
      }}
    }}

    function toggleAudioVoice() {{
      voiceEnabled = !voiceEnabled;
      document.getElementById('audioIcon').textContent = voiceEnabled ? '🔊' : '🔇';
      if (!voiceEnabled) {{
        audioEl.pause();
      }} else if (isPlaying) {{
        audioEl.currentTime = currentTime;
        audioEl.play().catch(() => {{}});
      }}
    }}

    function toggleSfx() {{
      sfxEnabled = !sfxEnabled;
      document.getElementById('sfxToggleBtn').style.opacity = sfxEnabled ? '1' : '0.5';
      if (!sfxEnabled) {{
        stopBackingBeat();
      }} else if (isPlaying) {{
        startBackingBeat();
      }}
    }}

    // Ambient Canvas Particles
    const canvas = document.getElementById('ambientCanvas');
    const ctx = canvas.getContext('2d');
    let particles = [];

    function resizeCanvas() {{
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }}
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    for (let i = 0; i < 45; i++) {{
      particles.push({{
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: Math.random() * 2 + 1,
        speedX: (Math.random() - 0.5) * 0.6,
        speedY: (Math.random() - 0.5) * 0.6,
        alpha: Math.random() * 0.4 + 0.1,
        color: Math.random() > 0.3 ? '#22c55e' : '#38bdf8',
      }});
    }}

    function drawParticles() {{
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {{
        p.x += p.speedX;
        p.y += p.speedY;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.fill();
      }});
      requestAnimationFrame(drawParticles);
    }}
    drawParticles();

    // Mouse interactive 3D parallax on desktop
    document.addEventListener('mousemove', (e) => {{
      const xOffset = (e.clientX / window.innerWidth - 0.5) * 15;
      const yOffset = (e.clientY / window.innerHeight - 0.5) * -15;
      document.getElementById('phoneViewport').style.transform = 
        `rotateY(${{xOffset}}deg) rotateX(${{yOffset}}deg)`;
    }});

    // Initial render
    renderFrame(0);
  </script>
</body>
</html>'''

with open('payround_advertisement.html', 'w', encoding='utf-8') as f:
    f.write(html_content)

import os
os.makedirs('public/ads', exist_ok=True)
with open('public/ads/index.html', 'w', encoding='utf-8') as f:
    f.write(html_content)

print("Generated payround_advertisement.html and public/ads/index.html successfully!")
