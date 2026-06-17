package scenes  
{
	import flash.display.Sprite;
	import lipsync.core.LipsyncSettings;
	import lipsync.player.LipsyncEvent;
	import lipsync.player.LipsyncPlayer;
	import util.NeuralNetworkProvider;
	/**
	 * ...
	 * @author S
	 */
	public class LipsyncTestScene extends Sprite {
		private var soundPlayer:LipsyncPlayer;
		
		public function LipsyncTestScene() {
			soundPlayer = new LipsyncPlayer(100, 1.0);
			soundPlayer.setupNeuralNetwork(NeuralNetworkProvider.getNetwork());
			soundPlayer.addEventListener(LipsyncEvent.PHONEME, onGetPhoneme);
			
			soundPlayer.playSound("../lib/final/female/aeiou.mp3");
		}
		
		private function onGetPhoneme(event:LipsyncEvent):void {
			if(event.phoneme.id != 0)
				trace(event.phoneme.visemeId);
		}
		
	}

}