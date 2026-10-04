from pathlib import Path
import subprocess,shutil,plistlib,zipfile,json
root=Path(__file__).resolve().parent
out=root/'nonmp-dist';app=out/'AnaBodhi NonMP.app';contents=app/'Contents';macos=contents/'MacOS';resources=contents/'Resources'
macos.mkdir(parents=True,exist_ok=True);resources.mkdir(parents=True,exist_ok=True)
shutil.copytree(root/'dist',resources/'plugin',dirs_exist_ok=True)
m=json.loads((resources/'plugin/manifest.json').read_text());m['enableOnMobile']=False;m['unlisted']=True;(resources/'plugin/manifest.json').write_text(json.dumps(m,indent=2)+'\n')
info={'CFBundleExecutable':'SMAnatomyPYQ','CFBundleIdentifier':'com.sunil.smanatpyq.nonmp','CFBundleName':'AnaBodhi NonMP','CFBundleDisplayName':'AnaBodhi NonMP','CFBundlePackageType':'APPL','CFBundleShortVersionString':'1.0','CFBundleVersion':'1.0','LSMinimumSystemVersion':'11.0','LSUIElement':True,'NSHighResolutionCapable':True}
(contents/'Info.plist').write_bytes(plistlib.dumps(info))
cache=root/'nonmp-build-cache';cache.mkdir(exist_ok=True)
for arch in ['arm64','x86_64']:
 subprocess.run(['xcrun','swiftc','-O','-swift-version','5','-module-cache-path',str(cache),'-target',arch+'-apple-macosx11.0',str(root/'NonMP-Helper.swift'),'-o',str(out/('helper-'+arch))],check=True)
subprocess.run(['lipo','-create',str(out/'helper-arm64'),str(out/'helper-x86_64'),'-output',str(macos/'SMAnatomyPYQ')],check=True)
shutil.copyfile(root/'NonMP-README.md',out/'START HERE.md')
shutil.copyfile(root/'NonMP-setup.html',resources/'plugin/setup.html')
subprocess.run(['codesign','--force','--sign','-',str(app)],check=True)
subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
zip_path=root/'AnaBodhi-1.0-NonMP-Mac.zip'
with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED) as archive:
 for p in sorted(app.rglob('*')):
  if p.is_file():archive.write(p,p.relative_to(out))
 archive.write(out/'START HERE.md','START HERE.md')
print(zip_path)
