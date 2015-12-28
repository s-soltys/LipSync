package lipsync.player 
{
	import lipsync.core.phoneme.Phoneme;
	/**
	 * ...
	 * @author S
	 */
	public class LipsyncBufferItem
	{
		public var phoneme:Phoneme;
		public var position:int;
		public var energy:Number;
		public var samples:Vector.<Number>;
		
		public function LipsyncBufferItem() {
			phoneme = Phoneme.NULL;
			energy = 0;
		}
		
	}

}