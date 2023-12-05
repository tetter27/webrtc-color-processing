const elementVideoLocal = document.getElementById("local_video_box");
const elementTextPageRole = document.getElementById("page_role_text");
const elementButtonSetOfferer = document.getElementById("set_offerer_button");
const elementButtonSetAnswerer = document.getElementById("set_answerer_button");
const elementButtonSetRemoteSDP = document.getElementById("set_remote_sdp");
const elementTextareaLocalSDP = document.getElementById("local_sdp_text");
const elementTextareaRemoteSDP = document.getElementById("remote_sdp_text");

const elementVideoRemote = document.getElementById("remote_video_box");
const elementAudioRemote = document.getElementById("audio_remote");

let rtcPeerConnection = null;
let pageRole = null;
let remoteVideo = null;
let remoteAudio = null;

const streamWidth = 640;
const streamHeight = 480;

let red =  1;
let green = 1;
let blue = 1;

// Get access to the camera
const stream = await navigator.mediaDevices.getUserMedia({
    video: {width: streamWidth, 
            height: streamHeight,
            frameRate: 60},
    audio: false,
});

elementButtonSetOfferer.onclick = onclickButton_SetAsOfferer;
elementButtonSetAnswerer.onclick = onclickButton_SetAsAnswerer;
elementButtonSetRemoteSDP.onclick = onclickButton_SetRemoteSDP;

const redElem = document.getElementById('red');
const greenElem = document.getElementById('green');
const blueElem = document.getElementById('blue');

redElem.addEventListener('change', changeRed);
greenElem.addEventListener('change', changeGreen);
blueElem.addEventListener('change', changeBlue);

function changeRed() {red = redElem.value;}
function changeGreen() {green = greenElem.value; console.log(green);}
function changeBlue() {blue = blueElem.value;}

// Create a processor and generator
const processor = new MediaStreamTrackProcessor(stream.getVideoTracks()[0]);
const generator = new MediaStreamTrackGenerator({kind: 'video'});

// Render the processed MediaStream
const processedStream = new MediaStream();
processedStream.addTrack(generator);
elementVideoLocal.srcObject = processedStream;
elementVideoLocal.play();

// Main image processing loop
const transformer = new TransformStream({
    async transform(videoFrame, controller) {
        // console.log(videoFrame)

        const data = await doImageProcessing(videoFrame, streamWidth, streamHeight);

        const outputVideoFrame = new VideoFrame(data, {
            timestamp: videoFrame.timestamp, 
            codedWidth: streamWidth,
            codedHeight: streamHeight,
            format: 'RGBA'
        });
        controller.enqueue(outputVideoFrame);

        videoFrame.close();

    }

});

// Connect the pipeline
processor.readable.pipeThrough(transformer).pipeTo(generator.writable);

async function doImageProcessing(videoFrame, streamWidth, streamHeight) {

    // Convart VideoFrame to ImageBitmap and pass into canvas.
    const imageBitmap = await createImageBitmap(videoFrame);
    const canvas = new OffscreenCanvas(1,1);    // needs an initial size
    const ctx = canvas.getContext("2d");
    canvas.width = streamWidth;
    canvas.height = streamHeight;
    ctx.drawImage(imageBitmap, 0, 0);

    // Get image data from canvas as ImageData.
    let imageBufferData = ctx.getImageData(0, 0, streamWidth, streamHeight).data;

    const dstData = new Uint8Array(streamHeight * streamWidth * 4);
    for (let y = 0; y < streamHeight; y++) {
        for (let x = 0; x < streamWidth; x++) {
            const i = y * streamWidth + x;
                dstData[i * 4] = parseInt(imageBufferData[i * 4] * red); // R
                dstData[i * 4 + 1] = parseInt(imageBufferData[i * 4 + 1] * green); // G
                dstData[i * 4 + 2] = parseInt(imageBufferData[i * 4 + 2] * blue); // B
                dstData[i * 4 + 3] = 255; // A
        }
    }

    return dstData;

}



function setupRTCPeerConnectionEventHandler(rtcPeerConnection){

    // Handler for the "Negotiation needed" event
    //   This event occurs when the change that needs session negotiation occurs.
    //   Since some session changes cannot be negotiated as an answer, this negotiation must be performed as an offerer.
    //   Most generally, the negotiationneeded event occurs after a transmission track is added to the RTCPeerConnection.
    //   This event does not occur when another negotiation is already ongoing.
    rtcPeerConnection.onnegotiationneeded = () =>{
        console.log("Event: Navigation needed.");
    };

    // Handler for the "ICE Candidate" event
    //   This event always occurs when any ICE agent starts streaming message.
    rtcPeerConnection.onicecandidate = (event) =>
    {
        console.log("Event : ICE candidate");
        if(event.candidate)
        {   // ICE candidate is existed
            console.log("=> ICE candidate : ", event.candidate);

            // If Vanilla ICE, SDP is not sending yet.
            // If Trickle ICE, initial SDP is sending.
        }
        else
        {   // There are no ICE candiate => Finalized ICE candidate collection.
            console.log("=> ICE candidate : empty");
        }
    };

    // Handler for the "ICE candidate" error
    //   This event occurs if an error occurs while collecing ICE candidates.
    //   [ToDo] Check https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/onicecandidateerror
    rtcPeerConnection.onicecandidateerror = (event) =>
    {
        console.error("Event : ICE candidate error. error code : ", event.errorCode);
    };

    // Handler for the "ICE gathering state change" event
    //   This event occurs when the change of "ICE gathering state".
    //   [ToDo] Check https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/onicegatheringstatechange
    rtcPeerConnection.onicegatheringstatechange = () =>
    {
        console.log("Event : ICE gathering state change");
        console.log("=> ICE gathering state : ", rtcPeerConnection.iceGatheringState);

        if("complete" === rtcPeerConnection.iceGatheringState)
        {
            // If Vanilla ICE, SDP is not sending yet.
            // If Trickle ICE, initial SDP is sending.

            // Paseted OfferSDP to textarea
            console.log("=> Set SDP in textarea");
            console.log("=> SDP type: %s", rtcPeerConnection.localDescription.type);

            pastelocalSDPtoTextarea(rtcPeerConnection, rtcPeerConnection.localDescription.type);

        }
    };

    // Handler for "ICE connection state change" event
    //   This event occurs if "ICE connection state" changed while negotiation process.
    //   "ICE connection state" normally transit "new" => "checking" => "connected" => "completed".
    //   However, in specific condition, "connected" is possibly skipped.
    //     (If the candidate that is checked at last only succeed.)
    //   [ToDo] Check https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/iceconnectionstatechange_event
    rtcPeerConnection.oniceconnectionstatechange = () =>
    {
        console.log("Event : ICE connection state change");
        console.log("=> ICE connection state : ", rtcPeerConnection.iceConnectionState);
        // "disconnected" : Failed at least one component to confirm that the component is still connecting.
        //                  This sometimes occurs intermittently, and is solved while temporary disconnection.
        // "failed"       : It means that all candidate peer are confirmed and there are no peer that has compatibility.
        // [ToDo] Check https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/iceConnectionState
    };

    // Handler for "Signaling state change" event
    //   This event send if "signalState" of peer connection changed.
    //   This possibly occurs due to call of setLocalDescription（） or setRemoteDescription（).
    //   [ToDo] Check https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/onsignalingstatechange
    rtcPeerConnection.onsignalingstatechange = () =>
    {
        console.log("Event : Signaling state change");
        console.log("=> Signaling state : ", rtcPeerConnection.signalingState);
    };

    // Handler for "Connection state change" event.
    //   This event occurs when peer connection state is changed.
    //   [ToDo] Check https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/onconnectionstatechange
    rtcPeerConnection.onconnectionstatechange = () =>
    {
        console.log("Event : Connection state change");
        console.log("=> Connection state : ", rtcPeerConnection.connectionState);
        // "disconnected" : At least one of the ICE transport are "disconnected" status, and
        //                  all of the other transports are not "failed" or "connecting", "checking" status.
        // "failed"       : At least one of the ICE transport are "failed" status.
        // [ToDo] Check https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/connectionState
    };

    // Handler for "Track" event.
    //   This event sends when new MediaStreamTrack of incoming call is created and it is associated with the 
    //   RTCRtpReceiver object that is added to receiver set on the connection.
    //   [ToDo] Check https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/ontrack
    //   !!! rtcPeerConnection.onaddstream is duplicated.
    rtcPeerConnection.ontrack = (event) =>
    {
        console.log("Event : Track");
        console.log("=> stream", event.streams[0]);
        console.log("=> track", event.track);

        displayRemoteMedia(event.streams[0], event.track.kind);

    };
}


function onclickButton_SetAsOfferer(){

    console.log("Selected Offerer.");
    elementTextPageRole.innerHTML = "You are Offerer!";

    pageRole = "offer";
    elementButtonSetOfferer.style.visibility = "hidden";
    elementButtonSetAnswerer.style.visibility = "hidden";

    let config = {"iceServers": []};
    rtcPeerConnection = new RTCPeerConnection(config);

    // The OfferSDP is pasted when "ICE gathering state change" becomes "complete".
    setupRTCPeerConnectionEventHandler(rtcPeerConnection);

    processedStream.getTracks().forEach((track) =>
        {
            rtcPeerConnection.addTrack(track, processedStream);
        });

    // Create OfferSDP
    createOfferSDP(rtcPeerConnection);
}


function onclickButton_SetAsAnswerer(){

    console.log("Selected Answerer.");
    elementTextPageRole.innerHTML = "You are Answerer!";

    pageRole = "answer";
    elementButtonSetOfferer.style.visibility = "hidden";
    elementButtonSetAnswerer.style.visibility = "hidden";
}

// Set Remote SDP button
function onclickButton_SetRemoteSDP(){

    if (pageRole == "offer"){
        // set SDP that issued by Answerer as Remote SDP.
        setAnswerSDPasRemoteSDP()

    }else if (pageRole === "answer"){
        // set SDP that issued by Offerer as Remote SDP.
        setOfferSDPasRemoteSDP()

    }else{

        console.log("You must select role of this tab.");
    }
}



function createPeerConnection(stream){
    let config = {"iceServer":[]};
    let rtcPeerConnection = new RTCPeerConnection(config);

    // Event handler for RTCPeetConnection
    setupRTCPeerConnectionEventHandler(rtcPeerConnection);

    // Add the local media stream to RTCPeerConnection object.
    if (stream){
        stream.getTracks().forEach((track) => {
            rtcPeerConnection.addTrack(track,stream);
        });
    }else{
        console.log("No local stream !!");
    }

    return rtcPeerConnection;

}

function createOfferSDP(rtcPeerConnection)
{

    console.log("Call : rtcPeerConnection.createOffer()");
    rtcPeerConnection.createOffer()
        .then((sessionDescription) =>
        {
            // Set OfferSDP ot LocalDescription
            console.log("Call : rtcPeerConnection.setLocalDescription()");
            return rtcPeerConnection.setLocalDescription(sessionDescription);
        })
        .then(() =>
        {
            // If Vanilla ICE, SDP is not sending yet.
            // If Trickle ICE, initial SDP is sending.
        })
        .catch((error) =>
        {
            console.error("Error : ", error);
        });
}

// The offer SDP is pasted when "ICE gathering state change" becomes "complete".
function pastelocalSDPtoTextarea(rtcPeerConnection, roleFromHandler){
    
    elementTextareaLocalSDP.value = rtcPeerConnection.localDescription.sdp;

}


function setOfferSDPasRemoteSDP(){

    // Get OfferSDP from Textarea
    let strOfferSDP = elementTextareaRemoteSDP.value;
    if(!strOfferSDP){ 
        alert("OfferSDP is empty. Please enter the OfferSDP.");
        return;
    }

    // Create RTCPeerConnection object
    console.log("Call : createPeerConnection()");
    rtcPeerConnection = createPeerConnection(processedStream);

    // Set OfferSDP as a remote SDP
    let sessionDescription = new RTCSessionDescription( {
        type: "offer",
        sdp: strOfferSDP,
    } );
    createAnswerSDP(rtcPeerConnection, sessionDescription);

}


function createAnswerSDP(rtcPeerConnection, sessionDescription){

    console.log("Call : rtcPeerConnection.createAnswer()");
    rtcPeerConnection.setRemoteDescription(sessionDescription)
        .then( () =>
        {
            // Create AnswerSDP
            console.log( "Call : rtcPeerConnection.createAnswer()" );
            return rtcPeerConnection.createAnswer();
        } )
        .then( (sessionDescription) =>
        {
            // Set created AnswerSDP in LocalDescription
            console.log( "Call : rtcPeerConnection.setLocalDescription()" );
            return rtcPeerConnection.setLocalDescription(sessionDescription);
        } )
        .then( () =>
        {
            // If Vanilla ICE, SDP is not sending yet.
            // If Trickle ICE, initial SDP is sending.
        } )
        .catch( (error) =>
        {
            console.error("Error : ", error);
        } );
}


function setAnswerSDPasRemoteSDP(){
    
    // Get AnswerSDP from Textarea
    let strAnswerSDP = elementTextareaRemoteSDP.value;
    if(!strAnswerSDP){ 
        alert("AnswerSDP is empty. Please enter the AnswerSDP.");
        return;
    }

    // Set AnswerSDP as a remote SDP
    let sessionDescription = new RTCSessionDescription( {
        type: "answer",
        sdp: strAnswerSDP,
    } );
    console.log( "Call : setAnswerSDP()" );
    setAnswerSDP(rtcPeerConnection, sessionDescription);
}


function setAnswerSDP( rtcPeerConnection, sessionDescription )
{
    console.log( "Call : rtcPeerConnection.setRemoteDescription()" );
    rtcPeerConnection.setRemoteDescription(sessionDescription)
        .catch( (error) =>
        {
            console.error("Error : ", error);
        } );
}

function displayRemoteMedia(stream, kind){

    if ("video" === kind)
    {
        console.log("Call : setStreamToElement( Video_Remote, stream )");
        remoteVideo = stream;
        elementVideoRemote.srcObject = remoteVideo;

    }else if ("audio" === kind){
        console.log("Call : setStreamToElement( Audio_Remote, stream )");
        remoteAudio = stream;
        
    }else{
        console.error( "Unexpected : Unknown track kind : ", kind );
    }
}