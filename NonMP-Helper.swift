import AppKit
import Network
import Foundation

let helperPort: UInt16 = {
    if let i=CommandLine.arguments.firstIndex(of:"--port"),CommandLine.arguments.count>i+1,let p=UInt16(CommandLine.arguments[i+1]),p>0{return p}
    return 27183
}()
let baseURL="http://localhost:\(helperPort)"
let resourceRoot=Bundle.main.resourceURL!.appendingPathComponent("plugin")
let files:Set<String>=["index.html","setup.html","manifest.json","README.md","index.js","index-sandbox.js","qbank_popup.js","qbank_popup-sandbox.js","App.css","snippet.css","index.css","index-sandbox.css","qbank_popup.css","qbank_popup-sandbox.css"]
let serverQueue=DispatchQueue(label:"anabodhi.server")
var listener:NWListener?

func reply(_ connection:NWConnection,_ status:String,_ mime:String,_ data:Data,head:Bool=false){
    let header="HTTP/1.1 \(status)\r\nContent-Type: \(mime)\r\nContent-Length: \(data.count)\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, HEAD, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nAccess-Control-Allow-Private-Network: true\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n"
    var payload=Data(header.utf8);if !head{payload.append(data)}
    connection.send(content:payload,completion:.contentProcessed{_ in connection.cancel()})
}
func route(_ connection:NWConnection,_ request:Data){
    guard let text=String(data:request,encoding:.utf8) else {reply(connection,"400 Bad Request","text/plain",Data());return}
    let lines=text.components(separatedBy:"\r\n"),first=lines[0].split(separator:" ")
    guard first.count==3 else {reply(connection,"400 Bad Request","text/plain",Data());return}
    let hosts=lines.dropFirst().filter{$0.lowercased().hasPrefix("host:")}.map{$0.dropFirst(5).trimmingCharacters(in:.whitespaces).lowercased()}
    guard hosts.count==1,["localhost:\(helperPort)","127.0.0.1:\(helperPort)"].contains(hosts[0]) else {reply(connection,"403 Forbidden","text/plain",Data());return}
    let method=String(first[0]);guard ["GET","HEAD","OPTIONS"].contains(method) else {reply(connection,"405 Method Not Allowed","text/plain",Data());return}
    if method=="OPTIONS"{reply(connection,"204 No Content","text/plain",Data());return}
    let rawPath=String(first[1].split(separator:"?",maxSplits:1,omittingEmptySubsequences:false)[0])
    if rawPath=="/health"{reply(connection,"200 OK","application/json",Data("{\"ok\":true,\"name\":\"AnaBodhi NonMP\",\"version\":\"1.0\"}".utf8),head:method=="HEAD");return}
    let file=rawPath=="/" ? "index.html" : String(rawPath.dropFirst())
    guard rawPath.hasPrefix("/"),files.contains(file),let data=try? Data(contentsOf:resourceRoot.appendingPathComponent(file)) else {reply(connection,"404 Not Found","text/plain",Data("Not found".utf8));return}
    let mime=file.hasSuffix(".js") ? "application/javascript; charset=utf-8" : file.hasSuffix(".json") ? "application/json" : file.hasSuffix(".css") ? "text/css; charset=utf-8" : file.hasSuffix(".html") ? "text/html; charset=utf-8" : "text/plain; charset=utf-8"
    reply(connection,"200 OK",mime,data,head:method=="HEAD")
}
func receive(_ connection:NWConnection,_ collected:Data=Data()){
    connection.receive(minimumIncompleteLength:1,maximumLength:8192){data,_,ended,error in
        var total=collected;if let data=data{total.append(data)}
        if total.count>16384{reply(connection,"431 Request Header Fields Too Large","text/plain",Data());return}
        if total.range(of:Data("\r\n\r\n".utf8)) != nil{route(connection,total)}
        else if ended || error != nil{connection.cancel()}
        else{receive(connection,total)}
    }
}
func startServer(_ state:@escaping (String)->Void){
    do{
        let parameters=NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host:"127.0.0.1",port:NWEndpoint.Port(rawValue:helperPort)!)
        let active=try NWListener(using:parameters);listener=active
        active.stateUpdateHandler={value in
            switch value{
            case .ready:state("Ready at \(baseURL)")
            case .failed(let error):state("Cannot start: \(error). Another helper may already be using this port.")
            default:break
            }
        }
        active.newConnectionHandler={connection in
            connection.start(queue:serverQueue)
            serverQueue.asyncAfter(deadline:.now()+15){connection.cancel()}
            receive(connection)
        }
        active.start(queue:serverQueue)
    }catch{state("Cannot start: \(error)")}
}
class AppDelegate:NSObject,NSApplicationDelegate{
    var item:NSStatusItem!
    var status=NSMenuItem(title:"Starting…",action:nil,keyEquivalent:"")
    func applicationDidFinishLaunching(_ notification:Notification){
        item=NSStatusBar.system.statusItem(withLength:NSStatusItem.variableLength);item.button?.title="AnaBodhi"
        let menu=NSMenu();menu.addItem(status);menu.addItem(.separator())
        let setup=NSMenuItem(title:"Setup instructions",action:#selector(showSetup),keyEquivalent:"");setup.target=self;menu.addItem(setup)
        let open=NSMenuItem(title:"Open RemNote",action:#selector(openRemNote),keyEquivalent:"");open.target=self;menu.addItem(open)
        menu.addItem(.separator());let quit=NSMenuItem(title:"Quit helper",action:#selector(quitApp),keyEquivalent:"q");quit.target=self;menu.addItem(quit);item.menu=menu
        startServer{message in DispatchQueue.main.async{self.status.title=message;if message.hasPrefix("Cannot start") {let alert=NSAlert();alert.messageText="AnaBodhi helper";alert.informativeText=message;alert.runModal()}}}
    }
    @objc func showSetup(){NSWorkspace.shared.open(URL(string:baseURL+"/setup.html")!)}
    @objc func openRemNote(){NSWorkspace.shared.open(URL(fileURLWithPath:"/Applications/RemNote.app"))}
    @objc func quitApp(){listener?.cancel();NSApplication.shared.terminate(nil)}
    func applicationWillTerminate(_ notification:Notification){listener?.cancel()}
}
if CommandLine.arguments.contains("--serve-only"){
    startServer{message in print(message);fflush(stdout)};dispatchMain()
}else{
    let application=NSApplication.shared;let delegate=AppDelegate();application.delegate=delegate;application.setActivationPolicy(.accessory);application.run()
}
