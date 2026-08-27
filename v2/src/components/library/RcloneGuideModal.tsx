interface Props {
  onClose: () => void;
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-6 h-6 rounded-full bg-[#534AB7] text-white text-xs font-extrabold flex items-center justify-center flex-shrink-0 mt-0.5">{n}</div>
      <div>
        <p className="text-sm font-bold text-white mb-1">{title}</p>
        <div className="text-xs text-white/60 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return <div className="bg-black/40 text-green-400 font-mono text-[11px] px-3 py-2 rounded-lg my-1.5 whitespace-pre-wrap break-all select-all">{children}</div>;
}

// Ports Phase 1's openRcloneGuide() — a static setup walkthrough for
// uploading photos to R2 directly from disk (bypassing the app entirely),
// then cataloging them into the library with Sync from R2.
export default function RcloneGuideModal({ onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-[#1a1750] border border-white/10 rounded-2xl w-full max-w-2xl p-6 flex flex-col gap-4 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-[#a89fff]">📖 How to Upload Photos via rclone</h3>
          <button onClick={onClose} className="text-xs font-semibold bg-white/10 hover:bg-white/15 rounded-lg px-3 py-1.5 text-white flex-shrink-0">✕ Close</button>
        </div>

        <div className="bg-green-500/10 border border-green-500/25 rounded-lg px-3.5 py-2.5 text-xs text-green-300 leading-relaxed">
          <strong>What this does:</strong> rclone copies your photo folders directly from your computer to the cloud (R2) — bypassing the app completely. Then click <strong>🔄 Sync from R2</strong> in the app and the library updates instantly. Upload 1,000+ photos in minutes with zero failures.
        </div>

        <Step n={1} title="Download and install rclone">
          Go to <strong className="text-white/80">rclone.org/downloads</strong> and download the Windows version. Extract the zip file anywhere on your computer (e.g. <code className="text-white/70">C:\rclone\</code>).
        </Step>

        <Step n={2} title="Get your Cloudflare R2 credentials">
          1. Open <strong className="text-white/80">dash.cloudflare.com</strong> and log in<br />
          2. Click <strong className="text-white/80">R2 Object Storage</strong> in the left menu<br />
          3. Click <strong className="text-white/80">Manage R2 API Tokens</strong> (top right)<br />
          4. Click <strong className="text-white/80">Create API Token</strong><br />
          5. Give it a name (e.g. "rclone"), set permission to <strong className="text-white/80">Object Read &amp; Write</strong>, select bucket <strong className="text-white/80">bangle-tracker-images</strong><br />
          6. Click Create — copy the <strong className="text-white/80">Access Key ID</strong> and <strong className="text-white/80">Secret Access Key</strong><br />
          7. Also copy your <strong className="text-white/80">Account ID</strong> (shown on the R2 main page, top right)
        </Step>

        <Step n={3} title="Configure rclone (one-time setup)">
          Open Command Prompt (press Windows key → type "cmd" → Enter). Navigate to where you extracted rclone:
          <Code>{'cd C:\\rclone'}</Code>
          Run the config wizard:
          <Code>{'rclone config'}</Code>
          Follow these answers:<br />
          • <strong className="text-white/80">n</strong> → New remote<br />
          • Name: <strong className="text-white/80">r2</strong><br />
          • Storage type: type <strong className="text-white/80">s3</strong> and press Enter<br />
          • Provider: type <strong className="text-white/80">Cloudflare</strong><br />
          • Access Key ID: paste your Access Key ID<br />
          • Secret Access Key: paste your Secret Access Key<br />
          • Region: leave blank (press Enter)<br />
          • Endpoint: <strong className="text-white/80">https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com</strong> (replace YOUR_ACCOUNT_ID with the Account ID you copied)<br />
          • Leave all other settings blank / default<br />
          • <strong className="text-white/80">y</strong> → Yes, this is OK
        </Step>

        <Step n={4} title="Organise your photos in the right folder structure">
          rclone reads your folder structure and preserves it exactly. Use this layout:
          <Code>{'Your Photos Folder\\\n  CNC\\\n    8MM CNC\\\n      8001.jpg\n      8002.jpg\n    10MM CNC\\\n      9001.jpg\n  Dye Gold\\\n    KERI DESIGN\\\n      K001.jpg'}</Code>
          The <strong className="text-white/80">first folder</strong> must be either <strong className="text-white/80">CNC</strong> or <strong className="text-white/80">Dye Gold</strong> (the segment). The <strong className="text-white/80">second folder</strong> is the design folder name (e.g. 8MM CNC). File names become the design code (8001.jpg → code 8001).
        </Step>

        <Step n={5} title="Upload your photos">
          In Command Prompt, run one command per segment:
          <Code>{'rclone copy "C:\\Your Photos Folder\\CNC" r2:bangle-tracker-images/CNC --progress'}</Code>
          <Code>{'rclone copy "C:\\Your Photos Folder\\Dye Gold" r2:bangle-tracker-images/Dye Gold --progress'}</Code>
          <strong className="text-white/80">--progress</strong> shows live upload status. rclone only uploads NEW files each time — safe to run again to add more photos. Replace <code className="text-white/70">C:\Your Photos Folder</code> with the actual path on your computer.
        </Step>

        <Step n={6} title="Sync the library in the app">
          Once rclone finishes uploading:<br />
          1. Open the app → go to <strong className="text-white/80">Library</strong><br />
          2. Click into <strong className="text-white/80">CNC</strong> or <strong className="text-white/80">Dye Gold</strong><br />
          3. Click <strong className="text-white/80">🔄 Sync from R2</strong><br />
          4. The app scans the bucket and adds all new photos to the library in seconds
        </Step>

        <div className="bg-[#534AB7]/15 border border-[#534AB7]/30 rounded-lg px-3.5 py-2.5 text-xs text-[#c9c3ff] leading-relaxed">
          <strong>💡 Tips:</strong><br />
          • Run rclone from anywhere — you don't need to be in the rclone folder if you add it to your PATH<br />
          • To check what would upload without actually uploading: add <strong>--dry-run</strong> to the command<br />
          • rclone automatically skips files already uploaded — safe to run anytime<br />
          • After future photo additions, run rclone again and then click Sync from R2
        </div>
      </div>
    </div>
  );
}
