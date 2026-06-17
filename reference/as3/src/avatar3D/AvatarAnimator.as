package avatar3D 
{
	import avatar3D.expression.AvatarExpression;
	import avatar3D.expression.ExpressionsCollection;
	import flash.events.Event;
	import flash.text.TextField;
	import lipsync.core.LipsyncSettings;
	import lipsync.core.network.NeuralNetwork;
	import lipsync.player.LipsyncEvent;
	import lipsync.player.LipsyncPlayer;
	import util.NeuralNetworkProvider;
	/**
	 * ...
	 * @author S
	 */
	public class AvatarAnimator extends AvatarCore
	{
		private var lipsync:LipsyncPlayer;
		private var i:int;
		
		public function AvatarAnimator() {
			lipsync = new LipsyncPlayer(100, 1.0);
			lipsync.setupNeuralNetwork(NeuralNetworkProvider.getNetwork());
			LipsyncSettings.recognizePhonemeDelay = 50;
			lipsync.addEventListener(LipsyncEvent.PHONEME, onLipsyncEvent);
			lipsync.addEventListener(LipsyncEvent.PLAYING_COMPLETE, onLipsyncComplete);
		}
		
		public function initAvatar():void {
			initAvatarCore();
		}
		
		public function saySentence(soundFile:String):void {
			lipsync.playSound(soundFile);
		}
		
		public function saySentences(soundFiles:Array):void {
			lipsync.playSounds(soundFiles);
		}
		
		public function isSpeaking():Boolean {
			return lipsync.isSoundPlaying();
		}
		
		public function saySentencesUsingNetwork(soundFiles:Array, nnetowrk:NeuralNetwork):void {
			lipsync.setupNeuralNetwork(nnetowrk);
			lipsync.playSounds(soundFiles);
		}
		
		private function onLipsyncEvent(event:LipsyncEvent):void {
			//var expression:AvatarExpression = ExpressionsCollection.getVisemeByAlias(event.phoneme.symbol);
			var expression:AvatarExpression = ExpressionsCollection.getVisemeById(event.phoneme.visemeId);
			setViseme(expression, event.amplitude * 13.5);
		}
		
		private function onLipsyncComplete(event:Event):void {
			mouth.setNeutral(0.5);
		}
		
	}

}